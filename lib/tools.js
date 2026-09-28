/**
 * DSH 原生 QA 工具：把工作台域工具注册到测试模式，并按当前会话 cwd
 * 绑定到唯一项目，避免模型通过参数越权操作其他项目。
 */
import os from 'node:os';
import path from 'node:path';

export const name = 'dsh-qa-tools';
export const inject = ['tools'];

const OUTPUT_SCHEMA = { type: 'object', additionalProperties: true };

function absolutePath(value) {
  return typeof value === 'string' && value.trim() ? path.resolve(value) : '';
}

/** Resolve exactly one workbench project for a DSH session working directory. */
export function projectForCwd(projects, cwd) {
  const target = absolutePath(cwd);
  if (!target) return null;
  return projects.find((project) => absolutePath(project.workspacePath) === target) || null;
}

function renderResult(_args, value) {
  return [{ type: 'text', text: JSON.stringify(value) ?? String(value) }];
}

/** Create the DSH-facing definition while keeping execution project-scoped. */
export function createToolDefinition(definition, dependencies = {}) {
  const run = dependencies.executeTool;
  const lookup = dependencies.projectForCwd;
  const definitionName = definition?.function?.name;
  if (!definitionName) throw new Error('dsh-qa tool definition requires a function name');
  if (typeof run !== 'function' || typeof lookup !== 'function') throw new Error('dsh-qa tool definition requires runtime dependencies');
  return {
    name: definitionName,
    description: definition.function.description,
    parameters: definition.function.parameters,
    output: { schema: OUTPUT_SCHEMA, render: renderResult },
    async execute(args, exec) {
      exec.signal?.throwIfAborted?.();
      const cwd = exec.agent?.session?.header?.cwd;
      const project = lookup(cwd);
      if (!project) throw new Error('当前 DSH 会话未绑定 dsh-qa 项目目录，无法写入项目数据');
      const result = await run(project.id, definitionName, args);
      exec.signal?.throwIfAborted?.();
      return result;
    },
  };
}

export async function apply(ctx) {
  process.env.QA_DATA_DIR ??= path.join(os.homedir(), '.dsh', 'dsh-qa');
  const [{ executeTool, TOOL_DEFS }, store] = await Promise.all([
    import('../server/tools.js'),
    import('../server/store.js'),
  ]);
  for (const definition of TOOL_DEFS) {
    ctx.tools.register(createToolDefinition(definition, {
      executeTool,
      projectForCwd: (cwd) => projectForCwd(store.listProjects(), cwd),
    }));
  }
}
