// 从技能官网读取卡片文案，并从 awesome-qa-skills 仓库取得安装文件。
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPOSITORY = 'https://github.com/naodeng/awesome-qa-skills';
const TREE_URL = 'https://api.github.com/repos/naodeng/awesome-qa-skills/git/trees/main?recursive=1';
const SKILL_REPOSITORY_URLS = {
  zh: `${REPOSITORY}/tree/main/skills/zh`,
  en: `${REPOSITORY}/tree/main/skills/en`,
};
const WEBSITE_ORIGIN = 'https://inaodeng.com';
const WEBSITE_PATHS = { zh: '/zh-cn/qaskills/', en: '/en/qaskills/' };
const CACHE_TTL = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
const CATEGORIES = [
  { id: 'type', zh: '测试类型', en: 'Testing types' },
  { id: 'workflow', zh: '工作流', en: 'Workflows' },
  { id: 'plus', zh: '加强版', en: 'Plus' },
];
const CATEGORY_IDS = new Set(CATEGORIES.map((category) => category.id));

function repositoryError() {
  const error = new Error('无法读取 awesome-qa-skills 仓库，请检查网络后重试');
  error.code = 'SKILLS_REPOSITORY_UNAVAILABLE';
  return error;
}

function websiteError() {
  const error = new Error('无法读取 QA Skills 官网目录，请检查网络后重试');
  error.code = 'SKILLS_WEBSITE_UNAVAILABLE';
  return error;
}

function decodeHtml(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const hexadecimal = entity[1].toLowerCase() === 'x';
      return String.fromCodePoint(Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10));
    }
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[entity.toLowerCase()];
  });
}

function parseWebsiteCatalog(html, lang) {
  const categoryLabels = new Map(CATEGORIES.map((category) => [category.id, category[lang]]));
  const skills = [];

  for (const [, tag] of html.matchAll(/<a\b([^>]*)>/g)) {
    const attributes = Object.fromEntries([...tag.matchAll(/([a-z][a-z\d-]*)="([^"]*)"/gi)].map(([, name, value]) => [name, decodeHtml(value)]));
    if (!attributes.class?.split(/\s+/).includes('skill-card') || !/^[a-z0-9][a-z0-9-]*$/.test(attributes['data-slug'] || '')) continue;
    if (!CATEGORY_IDS.has(attributes['data-category']) || !attributes['data-title']) continue;
    const name = attributes['data-slug'];
    skills.push({
      name,
      title: attributes['data-title'],
      description: attributes['data-intro'] || '',
      lang,
      categoryId: attributes['data-category'],
      category: categoryLabels.get(attributes['data-category']),
      siteUrl: `${WEBSITE_ORIGIN}${WEBSITE_PATHS[lang]}${name}/`,
    });
  }

  if (!skills.length) throw websiteError();
  return skills;
}

function getTitle(name) {
  return name.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

function runSkillsCli(args) {
  return new Promise((resolve, reject) => {
    execFile('npx', args, {
      timeout: 120000,
      env: { ...process.env, DISABLE_TELEMETRY: '1' },
    }, (error, stdout, stderr) => {
      if (error) return reject(new Error((stderr || stdout || error.message).trim()));
      resolve(stdout.trim());
    });
  });
}

export function createSkillsService({
  agentsSkillsDir = path.join(os.homedir(), '.agents', 'skills'),
  dshSkillsDir = process.env.DSH_SKILLS_DIR || path.join(os.homedir(), '.dsh', 'skills'),
  fetchImpl = fetch,
  runSkillsCli: runCli = runSkillsCli,
} = {}) {
  const agentsRoot = path.resolve(agentsSkillsDir);
  const installedRoots = [...new Set([agentsRoot, path.resolve(dshSkillsDir)])];
  let repositoryCache;
  let repositoryFetchedAt = 0;
  const websiteCache = new Map();

  function hasInstalledSkill(root, name) {
    return fs.existsSync(path.join(root, name, 'SKILL.md'));
  }

  async function getWebsiteCatalog(lang) {
    const cached = websiteCache.get(lang);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.skills;

    let response;
    try { response = await fetchImpl(`${WEBSITE_ORIGIN}${WEBSITE_PATHS[lang]}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }); } catch { throw websiteError(); }
    if (!response.ok) throw websiteError();
    let html;
    try { html = await response.text(); } catch { throw websiteError(); }
    const skills = parseWebsiteCatalog(html, lang);
    websiteCache.set(lang, { skills, fetchedAt: Date.now() });
    return skills;
  }

  async function getRepositoryCatalog() {
    if (repositoryCache && Date.now() - repositoryFetchedAt < CACHE_TTL) return repositoryCache;

    let treeResponse;
    try {
      treeResponse = await fetchImpl(TREE_URL, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-qa' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch {
      throw repositoryError();
    }
    if (!treeResponse.ok) throw repositoryError();

    let tree;
    try { tree = await treeResponse.json(); } catch { throw repositoryError(); }
    if (!tree || !Array.isArray(tree.tree)) throw repositoryError();
    const skills = new Map();

    for (const entry of tree.tree) {
      if (!entry || typeof entry.path !== 'string' || entry.type !== 'blob' || entry.mode === '120000') continue;
      const match = entry.path.match(/^skills\/(zh|en)\/(testing-types|testing-workflows|skill-engineering)\/([a-z0-9][a-z0-9-]*)\/(.+)$/);
      if (!match) continue;
      const [, lang, categoryId, name, filePath] = match;
      if (!filePath.split('/').every((part) => part && part !== '.' && part !== '..')) continue;
      const key = `${lang}/${name}`;
      let skill = skills.get(key);
      if (!skill) {
        skill = { lang, categoryId, name, files: [], hasSkillFile: false };
        skills.set(key, skill);
      }
      skill.files.push({ path: entry.path, mode: entry.mode });
      if (filePath === 'SKILL.md') skill.hasSkillFile = true;
    }

    repositoryCache = [...skills.values()]
      .filter((skill) => skill.hasSkillFile)
    if (!repositoryCache.length) throw repositoryError();
    repositoryFetchedAt = Date.now();
    return repositoryCache;
  }

  function readInstalledSkills() {
    const installed = new Map();
    for (const root of installedRoots) {
      if (!fs.existsSync(root)) continue;
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if ((!entry.isDirectory() && !entry.isSymbolicLink()) || !/^[a-z0-9][a-z0-9-]*$/.test(entry.name) || installed.has(entry.name)) continue;
        const skillFile = path.join(root, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillFile)) continue;
        const source = fs.readFileSync(skillFile, 'utf8');
        const title = source.match(/^#\s+(.+)$/m)?.[1]?.trim() || getTitle(entry.name);
        const description = source.match(/^description:\s*(.+)$/m)?.[1]?.trim() || '';
        installed.set(entry.name, { name: entry.name, title, description, siteUrl: REPOSITORY, installed: true });
      }
    }
    return [...installed.values()];
  }

  async function list(lang) {
    const installed = readInstalledSkills();
    let websiteSkills = [];
    let repositorySkills = [];
    let catalogUnavailable = false;
    let repositoryUnavailable = false;
    try {
      websiteSkills = await getWebsiteCatalog(lang);
    } catch (error) {
      if (error.code !== 'SKILLS_WEBSITE_UNAVAILABLE') throw error;
      catalogUnavailable = true;
    }
    try {
      repositorySkills = await getRepositoryCatalog();
    } catch (error) {
      if (error.code !== 'SKILLS_REPOSITORY_UNAVAILABLE') throw error;
      catalogUnavailable = true;
      repositoryUnavailable = true;
    }

    const installedNames = new Set(installed.map((skill) => skill.name));
    const repositoryNames = new Set(repositorySkills.filter((skill) => skill.lang === lang).map((skill) => skill.name));
    const websiteNames = new Set(websiteSkills.map((skill) => skill.name));
    const skills = websiteSkills.map((skill) => ({
      ...skill,
      installed: installedNames.has(skill.name),
      installedOnly: false,
      availableInRepository: repositoryUnavailable ? null : repositoryNames.has(skill.name),
    }));
    const installedOnly = installed
      .filter((skill) => !websiteNames.has(skill.name))
      .map((skill) => ({ ...skill, lang, categoryId: 'dsh-installed', category: lang === 'zh' ? 'DSH 已安装' : 'Installed in DSH', installedOnly: true }));

    return {
      categories: [
        ...(websiteSkills.length ? CATEGORIES : []),
        ...(installedOnly.length ? [{ id: 'dsh-installed', zh: 'DSH 已安装', en: 'Installed in DSH' }] : []),
      ],
      skills: [...skills, ...installedOnly],
      catalogUnavailable,
    };
  }

  async function install(lang, name) {
    if (installedRoots.some((root) => hasInstalledSkill(root, name))) return { name, installed: true, alreadyInstalled: true };

    const catalog = await getRepositoryCatalog();
    const skill = catalog.find((item) => item.lang === lang && item.name === name);
    if (!skill) return null;

    const output = await runCli([
      '--yes', 'skills', 'add', SKILL_REPOSITORY_URLS[lang], '--skill', name,
      '--global', '--agent', 'codex', '--yes',
    ]);
    if (!hasInstalledSkill(agentsRoot, name)) throw new Error(`Skills CLI 未在 ${agentsRoot} 中创建 ${name}`);
    return { name, installed: true, alreadyInstalled: false, output };
  }

  async function uninstall(name) {
    const presentRoots = installedRoots.filter((root) => hasInstalledSkill(root, name));
    if (!presentRoots.length) return false;
    if (presentRoots.includes(agentsRoot)) {
      await runCli(['--yes', 'skills', 'remove', name, '--global', '--agent', 'codex', '--yes']);
      if (hasInstalledSkill(agentsRoot, name)) throw new Error(`Skills CLI 未能卸载 ${name}`);
    }
    for (const root of presentRoots) {
      if (root === agentsRoot) continue;
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
    }
    return true;
  }

  return { list, install, uninstall };
}

export const skillsService = createSkillsService();
