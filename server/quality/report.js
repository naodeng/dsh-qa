export function buildDeliveryReport(project, gateId) {
  const gate = (project.gates || []).find((item) => item.id === gateId && item.kind === 'computed');
  if (!gate) throw new Error('计算门禁不存在');
  const evidenceRefs = [...new Set((gate.checks || []).flatMap((check) => check.evidenceRefs || []))].sort();
  const bundles = new Map((project.evidenceBundles || []).map((bundle) => [bundle.id, bundle]));
  const warnings = evidenceRefs.flatMap((id) => {
    const bundle = bundles.get(id);
    if (!bundle) return [`证据引用不存在：${id}`];
    if (bundle.state !== 'ready' || bundle.integrity !== 'verified') return [`证据完整性未验证：${id}`];
    return [];
  });
  return { gateId: gate.id, qualityTaskId: gate.qualityTaskId, verdict: gate.verdict, rulesetVersion: gate.rulesetVersion, calculatedAt: gate.calculatedAt, checks: structuredClone(gate.checks || []), evidenceRefs, warnings };
}
