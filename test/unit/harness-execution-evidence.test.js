import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProject } from '../helpers/quality-fixtures.js';
import { createTestRun } from '../../server/quality/test-run.js';
import { evaluateGate, evaluateQualityGate } from '../../server/quality/gate.js';
import { finalizeEvidence, verifyEvidence } from '../../server/quality/evidence.js';
import { mapHostExecutionResult, startHostExecution, validateHostExecutionRequest } from '../../server/quality/harness-execution.js';

const roots = [];

test.after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

function hostFixture() {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-host-evidence-'));
  roots.push(artifactRoot);
  const project = makeProject({
    id: `project_host_evidence_${roots.length}`,
    artifactRoot,
    qualityTasks: [{ id: 'qt_host_evidence', projectId: `project_host_evidence_${roots.length}`, version: 1, sources: [{ digest: 'source-1' }] }],
    executionProfiles: [{
      id: 'profile_host_evidence',
      kind: 'host',
      currentVersion: 1,
      disabled: false,
      versions: [{
        version: 1,
        kind: 'host',
        provider: 'browser-use',
        capabilities: ['navigate'],
        targetPolicy: { origins: ['https://example.test'], mcpTargets: [] },
        artifactPolicy: { logs: true, screenshots: true, trace: true },
        timeoutMs: 10_000,
      }],
    }],
  });
  const request = validateHostExecutionRequest(project, 'qt_host_evidence', {
    profileId: 'profile_host_evidence',
    provider: 'browser-use',
    capability: 'navigate',
    target: 'https://example.test',
    timeoutMs: 10_000,
    expectedRevision: 1,
  });
  return { project, request };
}

async function createPassedHostRun() {
  const fixture = hostFixture();
  const execution = await startHostExecution(fixture.project, fixture.request, {
    id: 'test-only-evidence-adapter',
    provider: 'browser-use',
    capabilities: ['navigate'],
    start: async (_request, context) => {
      const written = context.writeArtifact('run.log', 'passed');
      return { status: 'passed', artifacts: [{ type: 'log', ...written }] };
    },
  });
  const run = createTestRun(fixture.project, {
    mode: 'local',
    executor: 'host:browser-use:navigate',
    provenance: execution.provenance,
  });
  Object.assign(run, mapHostExecutionResult(fixture.project, execution, {
    status: execution.status,
    artifacts: execution.artifacts,
  }), { artifactDir: execution.stagingRoot });
  return { ...fixture, execution, run };
}

test('materializes controlled Host artifacts and finalizes through the existing evidence path', async () => {
  const { project, execution, run } = await createPassedHostRun();

  assert.equal(execution.status, 'passed');
  assert.equal(run.resultTrust, 'controlled-host');
  assert.equal(run.provenance.hostExecutionId, execution.id);
  assert.match(run.provenance.hostResultDigest, /^[a-f0-9]{64}$/);
  assert.equal(fs.readFileSync(path.join(execution.stagingRoot, 'run.log'), 'utf8'), 'passed');

  const bundle = await finalizeEvidence(project, run.id);
  assert.equal(bundle.state, 'ready');
  assert.equal(bundle.integrity, 'verified');
  assert.equal(bundle.provenance.hostExecutionId, execution.id);
  assert.equal(bundle.provenance.hostResultDigest, run.provenance.hostResultDigest);
  assert.deepEqual(bundle.items.map((item) => item.relativePath), ['run.log']);
  assert.equal((await verifyEvidence(bundle)).ok, true);
  assert.equal(fs.existsSync(run.artifactDir), false);
});

test('is idempotent for the same Host execution result and rejects a changed digest', async () => {
  const { project, run } = await createPassedHostRun();
  const first = await finalizeEvidence(project, run.id);
  const second = await finalizeEvidence(project, run.id);
  assert.equal(second.id, first.id);

  run.provenance.hostResultDigest = crypto.createHash('sha256').update('different-result').digest('hex');
  await assert.rejects(() => finalizeEvidence(project, run.id), /结果摘要|变化|复用/);
});

test('rejects incomplete Host summaries and provider-error evidence from becoming ready', async () => {
  const { project, run } = await createPassedHostRun();
  run.provenance.hostResultDigest = undefined;
  await assert.rejects(() => finalizeEvidence(project, run.id), /终态 provenance/);

  run.provenance.hostResultDigest = 'a'.repeat(64);
  run.status = 'environment-error';
  await assert.rejects(() => finalizeEvidence(project, run.id), /终态 provenance/);
});

test('requires matching verified Host evidence before computed or quality gates can pass', () => {
  const project = makeProject({ id: 'project_gate_host' });
  const provenance = { sourceDigests: [], commit: null, testPlanVersion: null, regressionSetVersion: null, profileId: 'profile', profileVersion: 1, hostExecutionId: 'host_1', hostResultDigest: 'a'.repeat(64) };
  const run = { id: 'run_host_1', projectId: project.id, status: 'passed', resultTrust: 'controlled-host', provenance, artifacts: [{ relativePath: 'run.log', type: 'log' }] };
  const rules = { version: 'gate-rules-v1', requireVerifiedEvidence: true, blockCriticalOpenRisk: true };
  const facts = { latestRun: run, provenance, risks: [] };

  assert.equal(evaluateGate({ ...facts, evidence: [] }, rules).verdict, 'BLOCK');
  assert.equal(evaluateGate({ ...facts, evidence: [{ id: 'ev-unready', testRunId: run.id, state: 'finalizing', integrity: 'unknown', provenance }] }, rules).verdict, 'BLOCK');
  assert.equal(evaluateGate({ ...facts, evidence: [{ id: 'ev-wrong-host', testRunId: run.id, state: 'ready', integrity: 'verified', provenance: { ...provenance, hostExecutionId: 'host_other' } }] }, rules).verdict, 'BLOCK');

  const evidence = { id: 'ev-host-1', testRunId: run.id, state: 'ready', integrity: 'verified', provenance };
  assert.equal(evaluateGate({ ...facts, evidence: [evidence] }, rules).verdict, 'PASS');
  project.testruns.push(run);
  project.evidenceBundles.push(evidence);
  assert.equal(evaluateQualityGate(project).status, 'passed');
  project.evidenceBundles[0].integrity = 'failed';
  assert.equal(evaluateQualityGate(project).status, 'blocked');
});
