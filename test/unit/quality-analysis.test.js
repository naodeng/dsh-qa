import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, makeQualityTask } from '../helpers/quality-fixtures.js';
import { appendDeniedAudit, commitQualityMutation, createAnalysisRequest, saveAnalysis } from '../../server/quality/analysis.js';

test('analysis commits only against the current revision and source digests', async () => {
  const project = makeProject();
  const task = makeQualityTask({ projectId: project.id, sources: [{ digest: 'digest_current' }] });
  project.qualityTasks.push(task);
  const request = createAnalysisRequest(project, task.id);
  assert.equal(request.taskId, task.id);
  const stale = await saveAnalysis({ analysisRequestId: request.id, expectedRevision: 1, sourceDigests: ['stale'], risks: [] }, project);
  assert.equal(stale.code, 'QUALITY_SOURCE_CHANGED');
  const saved = await saveAnalysis({ analysisRequestId: request.id, expectedRevision: 1, sourceDigests: ['digest_current'], risks: [] }, project);
  assert.equal(saved.ok, true);
  assert.equal(saved.task.version, 2);
  assert.equal(project.qualityAudit.at(-1).toRevision, 2);
});

test('denied analysis is audited without storing source正文', () => {
  const project = makeProject();
  const task = makeQualityTask({ projectId: project.id });
  project.qualityTasks.push(task);
  appendDeniedAudit(project, task, 'QUALITY_REVISION_CONFLICT');
  assert.equal(project.qualityAudit.at(-1).reason, 'QUALITY_REVISION_CONFLICT');
  assert.equal(JSON.stringify(project.qualityAudit).includes('sourceSnapshot'), false);
});

test('mutation wrapper rejects a task from another project', () => {
  const first = makeProject();
  const second = makeProject();
  const task = makeQualityTask({ projectId: first.id });
  first.qualityTasks.push(task);
  assert.equal(commitQualityMutation(second, task.id, 1, () => {}), null);
});
