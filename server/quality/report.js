export function buildDeliveryReport(project, gateId) {
  const gate = (project.gates || []).find((item) => item.id === gateId && item.kind === 'computed');
  if (!gate) throw new Error('计算门禁不存在');
  const evidenceRefs = [...new Set((gate.checks || []).flatMap((check) => check.evidenceRefs || []))].sort();
  const known = new Set((project.evidenceBundles || []).map((bundle) => bundle.id));
  const warnings = evidenceRefs.filter((id) => !known.has(id)).map((id) => `证据引用不存在：${id}`);
  return { gateId: gate.id, qualityTaskId: gate.qualityTaskId, verdict: gate.verdict, rulesetVersion: gate.rulesetVersion, calculatedAt: gate.calculatedAt, checks: structuredClone(gate.checks || []), evidenceRefs, warnings };
}
