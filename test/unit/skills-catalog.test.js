import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSkillsService } from '../../server/skills-catalog.js';

const treePaths = [
  'skills/zh/testing-types/requirements-analysis/SKILL.md',
  'skills/zh/testing-types/requirements-analysis/prompts/requirements-analysis.md',
  'skills/zh/testing-workflows/daily-testing-workflow/SKILL.md',
  'skills/zh/skill-engineering/skill-creator/SKILL.md',
  'skills/en/testing-types/requirements-analysis/SKILL.md',
];

function mockFetch({ websiteUnavailable = false, repositoryUnavailable = false } = {}) {
  const requests = [];
  const siteCards = {
    zh: [
      ['requirements-analysis', 'type', '需求分析', '输入需求文档或用户故事，输出信息缺口、业务规则、风险和测试范围。'],
      ['daily-testing-workflow', 'workflow', '日常测试工作流程', '需要按「一日 QA」节奏推进：晨间计划、执行、缺陷、日终收口。'],
      ['skill-creator', 'type', '技能创建', '设计并构建符合结构约定的 QA Skill。'],
      ['requirements-analysis-plus', 'plus', '需求分析加强版', '面向复杂项目的需求分析能力。'],
    ],
    en: [
      ['requirements-analysis', 'type', 'Requirements Analysis', 'Need help with requirements analysis in a real project context.'],
      ['daily-testing-workflow', 'workflow', 'Daily Testing Workflow', 'Need a one-day QA cadence: morning plan, execution, defects, EOD wrap-up.'],
      ['skill-creator', 'type', 'Skill Creator', 'Design and build a QA Skill that follows the repository conventions.'],
      ['requirements-analysis-plus', 'plus', 'Requirements Analysis Plus', 'Requirements analysis for complex projects.'],
    ],
  };
  const files = new Map([
    ['skills/zh/testing-types/requirements-analysis/SKILL.md', '---\nname: requirements-analysis\n---\n# 需求分析\n'],
    ['skills/zh/testing-types/requirements-analysis/prompts/requirements-analysis.md', '# 需求分析提示词\n'],
    ['skills/zh/testing-workflows/daily-testing-workflow/SKILL.md', '---\nname: daily-testing-workflow\n---\n'],
    ['skills/zh/skill-engineering/skill-creator/SKILL.md', '---\nname: skill-creator\n---\n'],
    ['skills/en/testing-types/requirements-analysis/SKILL.md', '---\nname: requirements-analysis\n---\n# Requirements Analysis\n'],
  ]);
  const fetchImpl = async (url) => {
    requests.push(String(url));
    if (String(url).includes('/git/trees/')) {
      if (repositoryUnavailable) throw new Error('offline');
      return new Response(JSON.stringify({ tree: treePaths.map((entry) => ({ path: entry, type: 'blob', mode: '100644' })) }), { status: 200 });
    }
    if (String(url).includes('inaodeng.com')) {
      if (websiteUnavailable) throw new Error('offline');
      const lang = new URL(String(url)).pathname.startsWith('/zh-cn/') ? 'zh' : 'en';
      const locale = lang === 'zh' ? 'zh-cn' : 'en';
      const html = siteCards[lang].map(([name, category, title, intro]) => `<a class="card skill-card" data-slug="${name}" data-category="${category}" data-title="${title}" data-intro="${intro}" href="/${locale}/qaskills/${name}/"></a>`).join('');
      return new Response(html, { status: 200 });
    }
    const filePath = new URL(String(url)).pathname.slice('/naodeng/awesome-qa-skills/main/'.length);
    if (files.has(filePath)) return new Response(files.get(filePath), { status: 200 });
    return new Response('not found', { status: 404 });
  };
  return { fetchImpl, requests };
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-qa-skills-catalog-'));
}

function tempSkillRoots(t) {
  const roots = { agentsSkillsDir: tempDir(), dshSkillsDir: tempDir() };
  t.after(() => {
    fs.rmSync(roots.agentsSkillsDir, { recursive: true, force: true });
    fs.rmSync(roots.dshSkillsDir, { recursive: true, force: true });
  });
  return roots;
}

test('catalog merges website skills with skills installed only in DSH', async (t) => {
  const { agentsSkillsDir, dshSkillsDir } = tempSkillRoots(t);
  fs.mkdirSync(path.join(dshSkillsDir, 'local-only'), { recursive: true });
  fs.writeFileSync(path.join(dshSkillsDir, 'local-only', 'SKILL.md'), '---\nname: local-only\ndescription: Local description\n---\n# 本地技能\n');
  fs.mkdirSync(path.join(dshSkillsDir, 'daily-testing-workflow'), { recursive: true });
  fs.writeFileSync(path.join(dshSkillsDir, 'daily-testing-workflow', 'SKILL.md'), '# Daily testing workflow\n');
  fs.mkdirSync(path.join(agentsSkillsDir, 'global-only'), { recursive: true });
  fs.writeFileSync(path.join(agentsSkillsDir, 'global-only', 'SKILL.md'), '# 全局技能\n');
  const { fetchImpl } = mockFetch();
  const service = createSkillsService({ agentsSkillsDir, dshSkillsDir, fetchImpl });

  const result = await service.list('zh');

  assert.deepEqual(result.categories.map(({ id }) => id), ['type', 'workflow', 'plus', 'dsh-installed']);
  assert.equal(result.skills.find(({ name }) => name === 'requirements-analysis').installed, false);
  assert.equal(result.skills.find(({ name }) => name === 'requirements-analysis').title, '需求分析');
  assert.equal(result.skills.find(({ name }) => name === 'requirements-analysis').description, '输入需求文档或用户故事，输出信息缺口、业务规则、风险和测试范围。');
  assert.equal(result.skills.find(({ name }) => name === 'skill-creator').categoryId, 'type');
  assert.equal(result.skills.find(({ name }) => name === 'requirements-analysis-plus').categoryId, 'plus');
  assert.equal(result.skills.find(({ name }) => name === 'requirements-analysis-plus').availableInRepository, false);
  assert.equal(result.skills.find(({ name }) => name === 'local-only').installedOnly, true);
  assert.equal(result.skills.find(({ name }) => name === 'local-only').title, '本地技能');
  assert.equal(result.skills.find(({ name }) => name === 'global-only').installedOnly, true);
  assert.equal(result.skills.find(({ name }) => name === 'global-only').installed, true);
  assert.equal(result.skills.find(({ name }) => name === 'daily-testing-workflow').installed, true);
  const english = await service.list('en');
  assert.equal(english.skills.find(({ name }) => name === 'requirements-analysis').title, 'Requirements Analysis');
  assert.equal(english.skills.find(({ name }) => name === 'requirements-analysis').description, 'Need help with requirements analysis in a real project context.');
  assert.equal(english.skills.find(({ name }) => name === 'daily-testing-workflow').categoryId, 'workflow');
});

test('website catalog stays visible but skills cannot install when the repository is unavailable', async (t) => {
  const { agentsSkillsDir, dshSkillsDir } = tempSkillRoots(t);
  fs.mkdirSync(path.join(dshSkillsDir, 'local-only'), { recursive: true });
  fs.writeFileSync(path.join(dshSkillsDir, 'local-only', 'SKILL.md'), '# Local skill\n');
  const { fetchImpl } = mockFetch({ repositoryUnavailable: true });
  const service = createSkillsService({ agentsSkillsDir, dshSkillsDir, fetchImpl });

  const result = await service.list('en');

  assert.equal(result.catalogUnavailable, true);
  assert.ok(result.skills.some(({ name }) => name === 'requirements-analysis'));
  assert.equal(result.skills.find(({ name }) => name === 'requirements-analysis').availableInRepository, null);
  assert.equal(result.skills.find(({ name }) => name === 'local-only').installed, true);
  assert.equal(result.skills.find(({ name }) => name === 'local-only').installedOnly, true);
});

test('installed skills remain manageable when both remote catalogs are unavailable', async (t) => {
  const { agentsSkillsDir, dshSkillsDir } = tempSkillRoots(t);
  fs.mkdirSync(path.join(dshSkillsDir, 'local-only'), { recursive: true });
  fs.writeFileSync(path.join(dshSkillsDir, 'local-only', 'SKILL.md'), '# Local skill\n');
  const { fetchImpl } = mockFetch({ websiteUnavailable: true, repositoryUnavailable: true });
  const service = createSkillsService({ agentsSkillsDir, dshSkillsDir, fetchImpl });

  const result = await service.list('en');

  assert.equal(result.catalogUnavailable, true);
  assert.deepEqual(result.skills.map(({ name }) => name), ['local-only']);
  assert.equal(result.skills[0].installed, true);
});

test('install skips a skill that already exists in the DSH Skills directory', async (t) => {
  const { agentsSkillsDir, dshSkillsDir } = tempSkillRoots(t);
  const installedFile = path.join(dshSkillsDir, 'requirements-analysis', 'SKILL.md');
  fs.mkdirSync(path.dirname(installedFile), { recursive: true });
  fs.writeFileSync(installedFile, 'existing copy');
  const { fetchImpl, requests } = mockFetch();
  const service = createSkillsService({ agentsSkillsDir, dshSkillsDir, fetchImpl });

  const result = await service.install('zh', 'requirements-analysis');

  assert.equal(result.alreadyInstalled, true);
  assert.equal(fs.readFileSync(installedFile, 'utf8'), 'existing copy');
  assert.equal(requests.some((url) => url.includes('raw.githubusercontent.com')), false);
});

test('install invokes the official Skills CLI for the global Codex skills directory', async (t) => {
  const agentsSkillsDir = tempDir();
  const dshSkillsDir = tempDir();
  t.after(() => {
    fs.rmSync(agentsSkillsDir, { recursive: true, force: true });
    fs.rmSync(dshSkillsDir, { recursive: true, force: true });
  });
  const { fetchImpl } = mockFetch();
  const calls = [];
  const service = createSkillsService({
    agentsSkillsDir,
    dshSkillsDir,
    fetchImpl,
    runSkillsCli: async (args) => {
      calls.push(args);
      const installedFile = path.join(agentsSkillsDir, 'requirements-analysis', 'SKILL.md');
      fs.mkdirSync(path.dirname(installedFile), { recursive: true });
      fs.writeFileSync(installedFile, '# 需求分析\n');
      return 'installed';
    },
  });

  const result = await service.install('zh', 'requirements-analysis');

  assert.deepEqual(calls, [[
    '--yes', 'skills', 'add', 'https://github.com/naodeng/awesome-qa-skills/tree/main/skills/zh',
    '--skill', 'requirements-analysis', '--global', '--agent', 'codex', '--yes',
  ]]);
  assert.equal(result.installed, true);
  assert.equal(fs.existsSync(path.join(agentsSkillsDir, 'requirements-analysis', 'SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(dshSkillsDir, 'requirements-analysis')), false);
});

test('uninstall removes global Skills CLI installs and legacy DSH installs', async (t) => {
  const agentsSkillsDir = tempDir();
  const dshSkillsDir = tempDir();
  t.after(() => {
    fs.rmSync(agentsSkillsDir, { recursive: true, force: true });
    fs.rmSync(dshSkillsDir, { recursive: true, force: true });
  });
  for (const root of [agentsSkillsDir, dshSkillsDir]) {
    const installedFile = path.join(root, 'requirements-analysis', 'SKILL.md');
    fs.mkdirSync(path.dirname(installedFile), { recursive: true });
    fs.writeFileSync(installedFile, '# 需求分析\n');
  }
  const calls = [];
  const service = createSkillsService({
    agentsSkillsDir,
    dshSkillsDir,
    runSkillsCli: async (args) => {
      calls.push(args);
      fs.rmSync(path.join(agentsSkillsDir, 'requirements-analysis'), { recursive: true, force: true });
      return 'removed';
    },
  });

  assert.equal(await service.uninstall('requirements-analysis'), true);
  assert.deepEqual(calls, [[
    '--yes', 'skills', 'remove', 'requirements-analysis', '--global', '--agent', 'codex', '--yes',
  ]]);
  assert.equal(fs.existsSync(path.join(agentsSkillsDir, 'requirements-analysis')), false);
  assert.equal(fs.existsSync(path.join(dshSkillsDir, 'requirements-analysis')), false);
});
