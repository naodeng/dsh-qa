export const CURRENT_SCHEMA_VERSION = 2;

function clone(value) {
  return structuredClone(value);
}

export function migrateDb(rawDb) {
  if (!rawDb || typeof rawDb !== 'object' || Array.isArray(rawDb)) throw new TypeError('数据库根节点必须是对象');
  const db = clone(rawDb);
  let version = Number.isInteger(db.schemaVersion) ? db.schemaVersion : 0;
  if (version > CURRENT_SCHEMA_VERSION) throw new Error('数据库版本过新');
  while (version < CURRENT_SCHEMA_VERSION) {
    if (version === 0) {
      db.projects = Array.isArray(db.projects) ? db.projects : [];
      db.feed = Array.isArray(db.feed) ? db.feed : [];
      db.artifactCleanupJobs = Array.isArray(db.artifactCleanupJobs) ? db.artifactCleanupJobs : [];
      for (const project of db.projects) {
        if (!project || typeof project !== 'object' || Array.isArray(project)) throw new TypeError('项目必须是对象');
        project.qualityTasks ||= [];
        project.qualityAudit ||= [];
      }
      version = 1;
      db.schemaVersion = version;
    }
    if (version === 1) {
      for (const project of db.projects) {
        project.evidenceBundles ||= [];
        project.failureAnalyses ||= [];
        project.regressionSets ||= [];
        project.artifactCleanupJobs ||= [];
      }
      version = 2;
      db.schemaVersion = version;
    }
  }
  return db;
}
