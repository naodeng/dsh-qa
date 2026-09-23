import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from './config.js';

const execFileAsync = promisify(execFile);
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
const CACHE_TTL_MS = 5 * 60 * 1000;
const REMOTE_TIMEOUT_MS = 1200;
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;
const APP_METADATA = {
  dshVersion: 'dsh-v0.1.7-alpha.1',
  repositoryUrl: 'https://github.com/naodeng/dsh-qa',
  websiteZhUrl: 'https://inaodeng.com/zh-cn/dsh-qa/',
  websiteEnUrl: 'https://inaodeng.com/en/dsh-qa/',
  releasesUrl: 'https://github.com/naodeng/dsh-qa/releases',
};

let cached = null;
let pending = null;

export function compareVersions(left, right) {
  const a = String(left || '0.0.0').replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right || '0.0.0').replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return 0;
}

function normalizeVersion(value) {
  const match = String(value || '').trim().match(VERSION_PATTERN);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : '';
}

function firstBullet(section) {
  return String(section || '').match(/^\s*-\s+(.+)$/m)?.[1]?.trim() || '';
}

function parseChangelog(text) {
  const headings = [...String(text || '').matchAll(/^##\s+(v?\d+\.\d+\.\d+)(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/gm)];
  return headings.map((heading, index) => {
    const version = normalizeVersion(heading[1]);
    const section = String(text || '').slice(heading.index + heading[0].length, headings[index + 1]?.index ?? String(text || '').length);
    const zhSection = section.match(/##\s+中文([\s\S]*?)(?=\n##\s+English|$)/i)?.[1] || section;
    const enSection = section.match(/##\s+English([\s\S]*)$/i)?.[1] || section;
    return {
      version,
      date: heading[2] || '',
      summaryZh: firstBullet(zhSection),
      summaryEn: firstBullet(enSection),
      detailUrl: `${APP_METADATA.releasesUrl}/tag/v${version}`,
    };
  }).filter((release) => release.version);
}

function mergeRelease(map, release) {
  if (!release?.version) return;
  const previous = map.get(release.version) || {};
  map.set(release.version, {
    ...previous,
    ...release,
    summaryZh: release.summaryZh || previous.summaryZh || '',
    summaryEn: release.summaryEn || previous.summaryEn || release.summaryZh || '',
    detailUrl: release.detailUrl || previous.detailUrl || `${APP_METADATA.releasesUrl}/tag/v${release.version}`,
  });
}

function summarizeReleaseBody(body) {
  const text = String(body || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .find(Boolean) || '';
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-qa-workbench' },
    });
    if (!response.ok) throw new Error(`Remote metadata request failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function readLocalReleases() {
  const map = new Map();
  try {
    const changelog = await fs.readFile(CHANGELOG_PATH, 'utf8');
    parseChangelog(changelog).forEach((release) => mergeRelease(map, release));
  } catch {
    // A published package may omit the repository changelog.
  }
  try {
    const { stdout } = await execFileAsync('git', [
      'for-each-ref', '--sort=-version:refname',
      '--format=%(refname:short)%09%(creatordate:short)%09%(subject)', 'refs/tags/v*',
    ], { cwd: ROOT, timeout: 1200, maxBuffer: 256 * 1024 });
    for (const line of stdout.split('\n').filter(Boolean)) {
      const [tag, date, subject = ''] = line.split('\t');
      const version = normalizeVersion(tag);
      if (!version) continue;
      const existing = map.get(version);
      mergeRelease(map, {
        ...(existing || {}),
        version,
        date: existing?.date || (/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''),
        summaryZh: existing?.summaryZh || subject,
        summaryEn: existing?.summaryEn || subject,
        detailUrl: existing?.detailUrl || `${APP_METADATA.releasesUrl}/tag/v${version}`,
      });
    }
  } catch {
    // Git metadata is not required when the package is installed from npm.
  }
  return [...map.values()].sort((a, b) => compareVersions(b.version, a.version));
}

async function readPackageVersion() {
  const packageJson = JSON.parse(await fs.readFile(PACKAGE_PATH, 'utf8'));
  return normalizeVersion(packageJson.version) || '0.0.0';
}

async function buildAppInfo() {
  const [currentVersion, localReleases] = await Promise.all([readPackageVersion(), readLocalReleases()]);
  const localByVersion = new Map(localReleases.map((release) => [release.version, release]));
  const [registryResult, githubResult] = await Promise.allSettled([
    fetchJson('https://registry.npmjs.org/dsh-qa/latest'),
    fetchJson('https://api.github.com/repos/naodeng/dsh-qa/releases?per_page=100'),
  ]);
  const latestFromRegistry = registryResult.status === 'fulfilled' ? normalizeVersion(registryResult.value?.version) : '';
  const releaseMap = new Map();
  if (githubResult.status === 'fulfilled' && Array.isArray(githubResult.value)) {
    for (const item of githubResult.value) {
      if (item?.draft || item?.prerelease) continue;
      const version = normalizeVersion(item.tag_name || item.name);
      if (!version) continue;
      const local = localByVersion.get(version);
      const summary = summarizeReleaseBody(item.body);
      mergeRelease(releaseMap, {
        version,
        date: String(item.published_at || item.created_at || local?.date || '').slice(0, 10),
        summaryZh: local?.summaryZh || summary,
        summaryEn: local?.summaryEn || summary,
        detailUrl: item.html_url || local?.detailUrl,
      });
    }
  }
  localReleases.forEach((release) => mergeRelease(releaseMap, release));
  const releases = [...releaseMap.values()].sort((a, b) => compareVersions(b.version, a.version));
  const latestVersion = [currentVersion, latestFromRegistry, ...releases.map((release) => release.version)]
    .filter(Boolean)
    .sort(compareVersions)
    .at(-1) || currentVersion;
  return {
    currentVersion,
    latestVersion,
    isOutdated: compareVersions(currentVersion, latestVersion) < 0,
    ...APP_METADATA,
    releases,
  };
}

export async function getAppInfo() {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!pending) {
    pending = buildAppInfo().then((value) => {
      cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
    }).finally(() => { pending = null; });
  }
  return pending;
}
