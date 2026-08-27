import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeProject } from '../helpers/quality-fixtures.js';
import { captureSource } from '../../server/quality/source.js';

test('captures requirements and bounded UTF-8 workspace files', async () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-source-'));
  const requirement = { id: 'req_fixture', title: '支付回调' };
  const project = makeProject({ requirements: [requirement], workspacePath });
  assert.equal((await captureSource(project, { type: 'requirement', ref: requirement.id })).type, 'requirement');
  fs.writeFileSync(path.join(workspacePath, 'ok.md'), '# v1');
  const file = await captureSource(project, { type: 'workspace-file', ref: 'ok.md' });
  assert.equal(file.content, '# v1');
  await assert.rejects(() => captureSource(project, { type: 'workspace-file', ref: '../secret' }), /越界/);
  fs.writeFileSync(path.join(workspacePath, 'binary.bin'), Buffer.from([0x61, 0x00, 0x62]));
  await assert.rejects(() => captureSource(project, { type: 'workspace-file', ref: 'binary.bin' }), /UTF-8|二进制/);
});

test('captures only an allowed Git revision', async () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-git-'));
  execFileSync('git', ['init', '-q'], { cwd: workspacePath });
  execFileSync('git', ['config', 'user.email', 'fixture@example.test'], { cwd: workspacePath });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: workspacePath });
  fs.writeFileSync(path.join(workspacePath, 'requirement.md'), '# v1');
  execFileSync('git', ['add', 'requirement.md'], { cwd: workspacePath });
  execFileSync('git', ['commit', '-qm', 'fixture v1'], { cwd: workspacePath });
  fs.writeFileSync(path.join(workspacePath, 'requirement.md'), '# v2');
  execFileSync('git', ['commit', '-qam', 'fixture v2'], { cwd: workspacePath });
  const project = makeProject({ workspacePath });
  await assert.rejects(() => captureSource(project, { type: 'git-diff', ref: '--output=/tmp/leak' }), /revision/);
  await assert.rejects(() => captureSource(project, { type: 'git-diff', ref: 'HEAD@{1}' }), /revision/);
  const diff = await captureSource(project, { type: 'git-diff', ref: 'HEAD~1..HEAD' });
  assert.equal(diff.digest.length, 64);
});
