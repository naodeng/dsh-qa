export const DSH_ATTACHMENT_LIMITS = Object.freeze({
  maxCount: 10,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
});

const DSH_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function attachmentError(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

export function validateDshAttachmentBatch(files) {
  const attachments = Array.from(files || []);
  if (attachments.length > DSH_ATTACHMENT_LIMITS.maxCount) {
    throw attachmentError('ATTACHMENT_COUNT_LIMIT', `每条消息最多添加 ${DSH_ATTACHMENT_LIMITS.maxCount} 个附件`);
  }
  let totalBytes = 0;
  for (const file of attachments) {
    const size = Number(file?.size);
    if (!Number.isFinite(size) || size < 0) {
      throw attachmentError('ATTACHMENT_SIZE_INVALID', '无法读取附件大小');
    }
    if (size > DSH_ATTACHMENT_LIMITS.maxFileBytes) {
      throw attachmentError('ATTACHMENT_FILE_LIMIT', `单个附件不能超过 ${DSH_ATTACHMENT_LIMITS.maxFileBytes / 1024 / 1024} MiB`, { name: file?.name || '' });
    }
    totalBytes += size;
  }
  if (totalBytes > DSH_ATTACHMENT_LIMITS.maxTotalBytes) {
    throw attachmentError('ATTACHMENT_TOTAL_LIMIT', `附件总大小不能超过 ${DSH_ATTACHMENT_LIMITS.maxTotalBytes / 1024 / 1024} MiB`);
  }
  return true;
}

export function isDshInlineImage(file) {
  return DSH_IMAGE_TYPES.has(String(file?.type || '').toLowerCase());
}

function encodeBase64(buffer) {
  if (typeof globalThis.btoa !== 'function') throw new Error('当前浏览器不支持图片附件编码');
  const bytes = new Uint8Array(buffer);
  const chunkSize = 24 * 1024; // divisible by three, so independently encoded chunks concatenate cleanly
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    let binary = '';
    for (let index = 0; index < chunk.length; index += 1) binary += String.fromCharCode(chunk[index]);
    encoded += globalThis.btoa(binary);
  }
  return encoded;
}

export async function encodeDshImage(file) {
  if (!isDshInlineImage(file)) throw attachmentError('ATTACHMENT_IMAGE_TYPE', '图片格式必须为 PNG、JPEG、WebP 或 GIF');
  if (typeof file?.arrayBuffer !== 'function') throw attachmentError('ATTACHMENT_READ_FAILED', '无法读取图片附件');
  return {
    type: 'image',
    mediaType: String(file.type).toLowerCase(),
    data: encodeBase64(await file.arrayBuffer()),
    ...(file.name ? { name: String(file.name) } : {}),
  };
}

function makeUploadError(message, { code, details, status } = {}) {
  const error = new Error(message || 'DSH 附件上传失败');
  if (code !== undefined) error.code = code;
  if (details !== undefined) error.details = details;
  if (status !== undefined) error.status = status;
  return error;
}

export async function uploadDshFile(fetchImpl, sessionId, file, { signal } = {}) {
  const query = new URLSearchParams({ sessionId: String(sessionId), name: String(file?.name || '') });
  let response;
  try {
    response = await fetchImpl(`/api/session/uploadFileBinary?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
      credentials: 'include',
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    throw makeUploadError('DSH 附件上传连接失败', { code: 'DSH_ATTACHMENT_NETWORK_ERROR', details: { cause: cause?.message || String(cause) } });
  }

  let result;
  try { result = await response.json(); }
  catch {
    throw makeUploadError(`DSH 附件上传失败（HTTP ${response.status}，响应格式无效）`, { code: 'DSH_ATTACHMENT_INVALID_RESPONSE', status: response.status });
  }
  if (!response.ok || result?.ok !== true) {
    const failure = result?.error || {};
    throw makeUploadError(failure.message || `DSH 附件上传失败（HTTP ${response.status}）`, {
      code: failure.code || 'DSH_ATTACHMENT_UPLOAD_FAILED',
      details: failure.details,
      status: response.status,
    });
  }
  const value = result.value;
  if (!value || typeof value.receiptId !== 'string' || !value.receiptId || !value.file || typeof value.file !== 'object') {
    throw makeUploadError('DSH 附件上传响应缺少 receipt', { code: 'DSH_ATTACHMENT_INVALID_RESPONSE', status: response.status });
  }
  return value;
}

export async function prepareDshAttachmentParts(drafts, { sessionId, uploadFile, encodeImage = encodeDshImage } = {}) {
  const parts = [];
  for (const draft of drafts || []) {
    const file = draft?.file;
    if (!file) throw attachmentError('ATTACHMENT_DRAFT_INVALID', '附件草稿已失效');
    if (isDshInlineImage(file)) {
      parts.push(await encodeImage(file));
      continue;
    }

    if (draft.receiptSessionId !== sessionId) {
      delete draft.receiptId;
      delete draft.receiptFile;
      delete draft.receiptSessionId;
    }
    if (!draft.receiptId) {
      if (typeof uploadFile !== 'function') throw new Error('DSH 文件上传服务不可用');
      const staged = await uploadFile(sessionId, file);
      if (!staged || typeof staged.receiptId !== 'string' || !staged.receiptId) {
        throw attachmentError('DSH_ATTACHMENT_INVALID_RESPONSE', 'DSH 附件上传响应缺少 receipt');
      }
      draft.receiptId = staged.receiptId;
      draft.receiptFile = staged.file || null;
      draft.receiptSessionId = sessionId;
    }
    parts.push({ type: 'file', receiptId: draft.receiptId });
  }
  return parts;
}

export function extractDshMessageAttachments(content) {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (!['file', 'image'].includes(block?.type) || !block.attachment || typeof block.attachment !== 'object') return [];
    const attachment = block.attachment;
    return [{
      kind: block.type,
      name: typeof attachment.name === 'string' ? attachment.name : '',
      bytes: Number.isFinite(Number(attachment.bytes)) ? Number(attachment.bytes) : 0,
      mediaType: typeof attachment.mediaType === 'string' ? attachment.mediaType : '',
    }];
  });
}
