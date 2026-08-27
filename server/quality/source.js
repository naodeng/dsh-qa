import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_BYTES = 1024 * 1024;
const REVISION_PART = '(?:HEAD(?:~[0-9]+)?|[0-9a-f]{40})';
const REVISION = new RegExp(`^(?:${REVISION_PART}|${REVISION_PART}\\.\\.${REVISION_PART}|${REVISION_PART}\\.\\.\\.${REVISION_PART})$`);

const digest = (content) => crypto.createHash('sha256').update(content).digest('hex');

function boundedText(buffer) {
  if (buffer.length > MAX_BYTES) throw new Error('来源超过 1 MiB');
  if (buffer.includes(0)) throw new Error('来源是二进制内容');
  const content = buffer.toString('utf8');
  if (Buffer.from(content, 'utf8').compare(buffer) !== 0) throw new Error('来源不是有效 UTF-8');
  return content;
}

function safePath(root, ref) {
  if (typeof ref !== 'string' || !ref || path.isAbsolute(ref)) throw new Error('来源路径越界');
  const base = path.resolve(root);
  const target = path.resolve(base, ref);
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('来源路径越界');
  return target;
}

function validateRevision(ref) {
  if (typeof ref !== 'string' || !REVISION.test(ref)) throw new Error('非法 Git revision');
}

export async function captureSource(project, descriptor = {}) {
  const type = descriptor.type;
  if (type === 'requirement') {
    const item = (project.requirements || []).find((requirement) => requirement.id === descriptor.ref);
    if (!item) throw new Error('需求不存在');
    const content = JSON.stringify(item);
    return { type, ref: descriptor.ref, digest: digest(content), content };
  }
  if (type === 'workspace-file') {
    const filename = safePath(project.workspacePath, descriptor.ref);
    const content = boundedText(await fs.readFile(filename));
    return { type, ref: descriptor.ref, digest: digest(content), content };
  }
  if (type === 'git-diff') {
    validateRevision(descriptor.ref);
    if (!project.workspacePath) throw new Error('项目未配置 Git workspace');
    try {
      const { stdout } = await execFileAsync('git', ['-C', project.workspacePath, 'diff', '--no-ext-diff', '--binary', descriptor.ref, '--'], { maxBuffer: MAX_BYTES + 1 });
      const content = boundedText(Buffer.from(stdout));
      return { type, ref: descriptor.ref, digest: digest(content), content };
    } catch (error) {
      if (error.message.includes('来源') || error.message.includes('revision')) throw error;
      throw new Error('Git 来源捕获失败');
    }
  }
  throw new Error('不支持的来源类型');
}
