import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRelease, sortReleases } from '../../server/app-info.js';

test('release merge keeps missing language summaries empty', () => {
  const map = new Map();

  mergeRelease(map, {
    version: '0.5.2',
    summaryZh: '中文摘要',
    summaryEn: '',
  });

  assert.equal(map.get('0.5.2').summaryZh, '中文摘要');
  assert.equal(map.get('0.5.2').summaryEn, '');
});

test('release sorting follows publication time before version', () => {
  const sorted = sortReleases([
    { version: '0.5.2', publishedAt: '2026-09-21T00:00:00.000Z' },
    { version: '0.5.1', publishedAt: '2026-09-23T00:00:00.000Z' },
  ]);

  assert.deepEqual(sorted.map((item) => item.version), ['0.5.1', '0.5.2']);
});
