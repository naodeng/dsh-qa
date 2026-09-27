import { now, uid } from '../../store.js';

export function appendQualityInsightAudit(project, fields = {}) {
  project.qualityAudit = Array.isArray(project.qualityAudit) ? project.qualityAudit : [];
  const createdAt = now();
  const audit = {
    id: uid('audit'),
    entityType: 'quality-insight',
    entityId: String(fields.entityId || ''),
    action: String(fields.action || ''),
    source: 'http',
    actorLabel: String(fields.actorLabel || ''),
    fromRevision: Number.isInteger(fields.fromRevision) ? fields.fromRevision : 0,
    toRevision: Number.isInteger(fields.toRevision) ? fields.toRevision : 0,
    result: String(fields.result || ''),
    errorCode: String(fields.errorCode || ''),
    reason: String(fields.reason || ''),
    inputDigest: String(fields.inputDigest || ''),
    scopeDigest: String(fields.scopeDigest || ''),
    createdAt,
    at: createdAt,
  };
  project.qualityAudit.push(audit);
  return audit;
}
