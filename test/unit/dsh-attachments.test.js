import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDshAttachmentBatch,
  isDshInlineImage,
  validateDshImageDimensions,
  encodeDshImage,
  uploadDshFile,
  prepareDshAttachmentParts,
  extractDshMessageAttachments,
} from '../../public/dsh-attachments.js';

function fakeFile({ name = 'note.txt', type = 'text/plain', size = 1, bytes = [1, 2, 3] } = {}) {
  const data = Uint8Array.from(bytes);
  return {
    name,
    type,
    size,
    async arrayBuffer() { return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); },
  };
}

test('validates the approved count, per-file and aggregate attachment limits', () => {
  assert.equal(validateDshAttachmentBatch(Array.from({ length: 10 }, () => fakeFile())), true);
  assert.throws(() => validateDshAttachmentBatch(Array.from({ length: 11 }, () => fakeFile())), /10/);
  assert.equal(validateDshAttachmentBatch([fakeFile({ size: 20 * 1024 * 1024 })]), true);
  assert.throws(() => validateDshAttachmentBatch([fakeFile({ size: 20 * 1024 * 1024 + 1 })]), /20/);
  assert.throws(() => validateDshAttachmentBatch([
    fakeFile({ size: 20 * 1024 * 1024 }),
    fakeFile({ size: 20 * 1024 * 1024 }),
    fakeFile({ size: 10 * 1024 * 1024 + 1 }),
  ]), /50/);
});

test('only supported raster media types use inline DSH image blocks', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
    assert.equal(isDshInlineImage(fakeFile({ type })), true);
  }
  for (const type of ['image/svg+xml', 'application/pdf', '']) {
    assert.equal(isDshInlineImage(fakeFile({ type })), false);
  }
});

test('validates DSH image side and pixel limits before encoding', async () => {
  const image = fakeFile({ name: 'screen.png', type: 'image/png' });
  assert.deepEqual(await validateDshImageDimensions(image, { decodeImage: async () => ({ width: 8192, height: 7812 }) }), {
    width: 8192,
    height: 7812,
  });
  await assert.rejects(
    validateDshImageDimensions(image, { decodeImage: async () => ({ width: 8193, height: 1 }) }),
    (error) => error.code === 'ATTACHMENT_IMAGE_DIMENSION_LIMIT',
  );
  await assert.rejects(
    validateDshImageDimensions(image, { decodeImage: async () => ({ width: 8001, height: 8000 }) }),
    (error) => error.code === 'ATTACHMENT_IMAGE_PIXEL_LIMIT',
  );
  await assert.rejects(
    validateDshImageDimensions(image, { decodeImage: async () => { throw new Error('decoder failed'); } }),
    /无法读取图片尺寸/,
  );
});

test('encodes an image as a named DSH prompt block without changing the bytes', async () => {
  const image = fakeFile({ name: '截图.png', type: 'image/png', bytes: [0, 1, 2, 255] });
  assert.deepEqual(await encodeDshImage(image), {
    type: 'image',
    mediaType: 'image/png',
    data: 'AAEC/w==',
    name: '截图.png',
  });
});

test('uploads a generic file as raw bytes and parses the bare DSH response', async () => {
  const file = fakeFile({ name: '需求 与验收.md', bytes: [7, 8] });
  const request = {};
  const result = await uploadDshFile(async (url, options) => {
    request.url = url;
    request.options = options;
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true, value: { receiptId: 'receipt-1', file: { name: file.name, bytes: file.size } } };
      },
    };
  }, 'session/1', file);

  assert.equal(request.url, '/api/session/uploadFileBinary?sessionId=session%2F1&name=%E9%9C%80%E6%B1%82+%E4%B8%8E%E9%AA%8C%E6%94%B6.md');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'application/octet-stream');
  assert.equal(request.options.body, file);
  assert.deepEqual(result, { receiptId: 'receipt-1', file: { name: file.name, bytes: file.size } });
});

test('passes an AbortSignal through to the native upload request', async () => {
  const controller = new AbortController();
  let receivedSignal;
  await uploadDshFile(async (_url, options) => {
    receivedSignal = options.signal;
    return { ok: true, status: 200, async json() { return { ok: true, value: { receiptId: 'receipt-abort', file: { name: 'a.txt', bytes: 1 } } }; } };
  }, 'session-1', fakeFile(), { signal: controller.signal });
  assert.equal(receivedSignal, controller.signal);
});

test('preserves DSH upload error codes and rejects malformed successful responses', async () => {
  await assert.rejects(uploadDshFile(async () => ({
    ok: true,
    status: 200,
    async json() { return { ok: false, error: { code: 'session/attachment-invalid', message: 'File too large', details: { reason: 'FILE_TOO_LARGE' } } }; },
  }), 'session-1', fakeFile()), (error) => {
    assert.equal(error.code, 'session/attachment-invalid');
    assert.deepEqual(error.details, { reason: 'FILE_TOO_LARGE' });
    return /File too large/.test(error.message);
  });

  await assert.rejects(uploadDshFile(async () => ({
    ok: true,
    status: 200,
    async json() { return { ok: true, value: {} }; },
  }), 'session-1', fakeFile()), /receipt/i);
});

test('prepares mixed attachments in selection order and reuses staged file receipts', async () => {
  const image = { file: fakeFile({ name: 'image.png', type: 'image/png' }) };
  const file = { file: fakeFile({ name: 'spec.md' }) };
  const secondFile = { file: fakeFile({ name: 'cases.csv' }), receiptId: 'existing-receipt', receiptSessionId: 'session-1' };
  let uploadCount = 0;

  const parts = await prepareDshAttachmentParts([image, file, secondFile], {
    sessionId: 'session-1',
    validateImage: async () => true,
    encodeImage: async (candidate) => ({ type: 'image', mediaType: candidate.type, data: 'AQID', name: candidate.name }),
    uploadFile: async (_sessionId, candidate) => {
      uploadCount += 1;
      return { receiptId: `receipt-${candidate.name}`, file: { name: candidate.name, bytes: candidate.size } };
    },
  });

  assert.deepEqual(parts, [
    { type: 'image', mediaType: 'image/png', data: 'AQID', name: 'image.png' },
    { type: 'file', receiptId: 'receipt-spec.md' },
    { type: 'file', receiptId: 'existing-receipt' },
  ]);
  assert.equal(file.receiptId, 'receipt-spec.md');
  assert.deepEqual(file.receiptFile, { name: 'spec.md', bytes: 1 });
  assert.equal(uploadCount, 1);

  await prepareDshAttachmentParts([image, file, secondFile], {
    sessionId: 'session-1',
    validateImage: async () => true,
    encodeImage: async (candidate) => ({ type: 'image', mediaType: candidate.type, data: 'AQID', name: candidate.name }),
    uploadFile: async () => { uploadCount += 1; throw new Error('should not upload a cached receipt'); },
  });
  assert.equal(uploadCount, 1);
});

test('validates every image before staging any generic file', async () => {
  const file = { file: fakeFile({ name: 'spec.md' }) };
  const oversizedImage = { file: fakeFile({ name: 'large.png', type: 'image/png' }) };
  let uploadCount = 0;
  await assert.rejects(prepareDshAttachmentParts([file, oversizedImage], {
    sessionId: 'session-1',
    validateImage: async () => { throw Object.assign(new Error('too many pixels'), { code: 'ATTACHMENT_IMAGE_PIXEL_LIMIT' }); },
    uploadFile: async () => { uploadCount += 1; return { receiptId: 'unexpected' }; },
  }), /too many pixels/);
  assert.equal(uploadCount, 0);
});

test('does not reuse a receipt staged for another session', async () => {
  const draft = { file: fakeFile(), receiptId: 'old-receipt', receiptSessionId: 'old-session' };
  const parts = await prepareDshAttachmentParts([draft], {
    sessionId: 'new-session',
    uploadFile: async (sessionId, file) => ({ receiptId: `${sessionId}:${file.name}`, file: { name: file.name, bytes: file.size } }),
  });
  assert.deepEqual(parts, [{ type: 'file', receiptId: 'new-session:note.txt' }]);
  assert.equal(draft.receiptSessionId, 'new-session');
  assert.equal(draft.receiptId, 'new-session:note.txt');
});

test('extracts durable file and image metadata from DSH history blocks', () => {
  assert.deepEqual(extractDshMessageAttachments([
    { type: 'text', text: 'review these' },
    { type: 'file', attachment: { attachmentId: 'opaque-1', name: '<spec>.md', bytes: 42 } },
    { type: 'image', attachment: { attachmentId: 'opaque-2', name: 'shot.png', mediaType: 'image/png', bytes: 24 } },
    { type: 'file', attachment: { attachmentId: 'opaque-3', bytes: 5 } },
    { type: 'file', receiptId: 'not-a-durable-history-block' },
  ]), [
    { kind: 'file', name: '<spec>.md', bytes: 42, mediaType: '' },
    { kind: 'image', name: 'shot.png', bytes: 24, mediaType: 'image/png' },
    { kind: 'file', name: '', bytes: 5, mediaType: '' },
  ]);
});
