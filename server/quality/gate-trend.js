export function buildGateTrend(project, qualityTaskId) {
  const series = (project.gates || []).filter((gate) => gate.kind === 'computed' && gate.qualityTaskId === qualityTaskId).sort((a, b) => String(a.calculatedAt).localeCompare(String(b.calculatedAt)) || String(a.id).localeCompare(String(b.id))).map((gate) => ({ id: gate.id, verdict: gate.verdict, calculatedAt: gate.calculatedAt, checks: structuredClone(gate.checks || []) }));
  const counts = { PASS: 0, WARN: 0, BLOCK: 0 };
  for (const point of series) if (point.verdict in counts) counts[point.verdict] += 1;
  let consecutiveBlock = 0;
  for (const point of [...series].reverse()) { if (point.verdict !== 'BLOCK') break; consecutiveBlock += 1; }
  return { qualityTaskId, series, counts, consecutiveBlock };
}
