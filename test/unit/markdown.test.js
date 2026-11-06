import { test } from 'node:test';
import assert from 'node:assert/strict';

const markdownModule = await import('../../public/markdown.js').catch(() => ({}));
const { renderMarkdown } = markdownModule;

function requireRenderer() {
  assert.equal(typeof renderMarkdown, 'function', 'public/markdown.js should export renderMarkdown');
}

test('renders headings, paragraphs, emphasis, and inline code', () => {
  requireRenderer();
  assert.equal(
    renderMarkdown('## 登记结果\n\n**未执行测试。** 状态为 `draft`。'),
    '<h2>登记结果</h2><p><strong>未执行测试。</strong> 状态为 <code>draft</code>。</p>',
  );
});

test('keeps underscores inside identifiers from becoming emphasis', () => {
  requireRenderer();
  assert.equal(renderMarkdown('req_1a0e5d98f40_196f73c9'), '<p>req_1a0e5d98f40_196f73c9</p>');
});

test('renders Markdown tables with column labels for responsive rows', () => {
  requireRenderer();
  const html = renderMarkdown('| 类型 | 标题 |\n| --- | --- |\n| 用例 | 登录成功 |');

  assert.match(html, /<table class="md-table">/);
  assert.match(html, /<th scope="col">类型<\/th>/);
  assert.match(html, /<td data-label="类型">用例<\/td>/);
  assert.match(html, /<td data-label="标题">登录成功<\/td>/);
});

test('renders unordered and ordered lists as semantic lists', () => {
  requireRenderer();
  assert.equal(
    renderMarkdown('- 需求\n- 用例\n\n1. 第一步\n2. 第二步'),
    '<ul><li>需求</li><li>用例</li></ul><ol><li>第一步</li><li>第二步</li></ol>',
  );
});

test('groups unverified-result sections into a visible warning panel', () => {
  requireRenderer();
  assert.equal(
    renderMarkdown('## 未执行 / 未验证（重要）\n\n- 未执行任何测试。'),
    '<aside class="md-warning"><h2>未执行 / 未验证（重要）</h2><ul><li>未执行任何测试。</li></ul></aside>',
  );
});

test('escapes raw HTML and only links safe HTTP URLs', () => {
  requireRenderer();
  const html = renderMarkdown('<img src=x onerror=alert(1)> [安全链接](https://example.com) [危险链接](javascript:alert(1))');

  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">安全链接<\/a>/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /\[危险链接\]\(javascript:alert\(1\)\)/);
});
