import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startQaBench, closeQaBench } from '../../server/index.js';
import { createSkillsService } from '../../server/skills-catalog.js';

const testDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const skillCards = [
  { name: 'requirements-analysis', category: 'type', zh: ['需求分析', '输入需求文档，整理信息缺口、风险和测试范围。'], en: ['Requirements Analysis', 'Turn requirements into gaps, risks, and test scope.'] },
  { name: 'api-test-bruno', category: 'type', zh: ['Bruno API 测试', '用 Bruno 编写和维护可重复执行的 API 测试。'], en: ['API Test Bruno', 'Write and maintain repeatable API tests with Bruno.'] },
  { name: 'api-test-pytest', category: 'type', zh: ['Pytest API 测试', '用 pytest 构建可重复执行的 API 测试。'], en: ['API Test Pytest', 'Build repeatable API tests with pytest.'] },
  { name: 'daily-testing-workflow', category: 'workflow', zh: ['日常测试工作流程', '按一日 QA 节奏推进计划、执行、缺陷跟进和收口。'], en: ['Daily Testing Workflow', 'Plan, execute, track defects, and wrap up a QA day.'] },
  { name: 'catalog-only-preview', category: 'plus', zh: ['目录预览项', '当前只在官网目录展示。'], en: ['Catalog preview', 'Visible in the website catalog only.'] },
];
const categories = {
  type: ['testing-types', 'type'],
  workflow: ['testing-workflows', 'workflow'],
  plus: ['skill-engineering', 'plus'],
};
const repositoryTree = fs.readdirSync(path.join(testDir, 'fixtures', 'qa-skills', 'skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((language) => skillCards.flatMap((skill) => {
    if (skill.name === 'catalog-only-preview') return [];
    const [repositoryCategory] = categories[skill.category];
    const skillFile = path.join(testDir, 'fixtures', 'qa-skills', 'skills', language.name, repositoryCategory, skill.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) return [];
    return [{ path: `skills/${language.name}/${repositoryCategory}/${skill.name}/SKILL.md`, type: 'blob', mode: '100644' }];
  }));

async function fetchSkillCatalog(url) {
  const target = new URL(String(url));
  if (target.hostname === 'inaodeng.com') {
    const lang = target.pathname.startsWith('/zh-cn/') ? 'zh' : 'en';
    const html = skillCards.map((skill) => {
      const [title, description] = skill[lang];
      return `<a class="skill-card" data-slug="${skill.name}" data-category="${skill.category}" data-title="${title}" data-intro="${description}" href="/${lang === 'zh' ? 'zh-cn' : 'en'}/qaskills/${skill.name}/"></a>`;
    }).join('');
    return new Response(html, { status: 200 });
  }
  if (target.hostname === 'api.github.com' && target.pathname.endsWith('/git/trees/main')) {
    return new Response(JSON.stringify({ tree: repositoryTree }), { status: 200 });
  }
  return new Response('Not found', { status: 404 });
}

const dataDir = process.env.QA_DATA_DIR;
const skillsService = createSkillsService({
  agentsSkillsDir: path.join(dataDir, 'agents-skills'),
  dshSkillsDir: path.join(dataDir, 'dsh-skills'),
  fetchImpl: fetchSkillCatalog,
});
const { server } = await startQaBench({
  port: Number(process.env.QA_PORT || 8899),
  openBrowser: false,
  skillsService,
  log: () => {},
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await closeQaBench(server);
    process.exit(0);
  });
}
