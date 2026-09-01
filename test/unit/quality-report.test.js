import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEvidenceBundle, makeGate, makeProject } from '../helpers/quality-fixtures.js';
import { buildDeliveryReport } from '../../server/quality/report.js';

test('builds a traceable report from the saved gate without recalculating it', () => {
  const gate = makeGate({ id: 'gate_report', verdict: 'BLOCK', checks: [{ key: 'critical-risk', evidenceRefs: ['evidence_report'] }] });
  const project = makeProject({ gates: [gate], evidenceBundles: [makeEvidenceBundle({ id: 'evidence_report' })] });
  const report = buildDeliveryReport(project, gate.id);
  assert.equal(report.verdict, 'BLOCK');
  assert.deepEqual(report.evidenceRefs, ['evidence_report']);
  assert.equal(report.warnings.length, 0);
});

test('reports missing saved evidence references instead of hiding them', () => {
  const gate = makeGate({ id: 'gate_missing', verdict: 'WARN', checks: [{ key: 'coverage', evidenceRefs: ['missing_evidence'] }] });
  const report = buildDeliveryReport(makeProject({ gates: [gate] }), gate.id);
  assert.match(report.warnings[0], /引用不存在/);
});
