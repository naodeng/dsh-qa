// DeepSeek 对话引擎：流式 chat completions + 函数调用 agent 循环
import { loadConfig } from './config.js';
import * as store from './store.js';
import { broadcast } from './sse.js';
import { TOOL_DEFS, TOOL_CN, executeTool } from './tools.js';
import { projectCard } from './board.js';

const ROLE_CN = { owner: '负责人', qa: '测试', dev: '开发', pm: '产品', other: '其他' };
const REQ_KIND_CN = { functional: '功能需求', nonfunctional: '非功能需求', risk: '风险点', issue: '问题' };
const KIND_LABELS = { project: '测试项目', iteration: '迭代' };

export function buildSystemPrompt(p) {
  const assistant = p.assistant || { enabled: true, mode: 'full', autoExtract: true, reminders: 'all' };
  let modeInstruction = !assistant.enabled
    ? '本项目已关闭自动辅助：只回答问题，不调用工具，不自动登记或推进项目。'
    : assistant.mode === 'manual'
      ? '当前是按需协作模式：仅在用户明确要求登记、生成或推进时调用工具，不主动改变项目数据。'
      : '当前是全流程辅助模式：主动识别应登记的需求、用例、缺陷、里程碑并给出下一步提醒，但所有门禁与最终决定仍由测试负责人完成。';
  if (assistant.enabled && assistant.autoExtract === false) {
    modeInstruction += ' 本项目已关闭自动提取：只有用户明确要求登记、保存、生成或推进时才调用工具。';
  }
  const snapshot = JSON.stringify({
    title: p.title, projectKey: p.projectKey, product: p.product, owner: p.owner,
    kind: p.kind, kindLabel: KIND_LABELS[p.kind] || p.kind, type: p.type,
    members: p.members, summary: p.summary, status: p.status,
    milestones: p.milestones, requirements: p.requirements, testcases: p.testcases,
    defects: p.defects, reports: p.reports.map(d => ({ id: d.id, docType: d.docType, title: d.title, status: d.status, versionCount: d.versions.length })),
    knowledge: p.knowledge, gates: p.gates,
  }, null, 1).slice(0, 9000);

  return `你是「质量工作台」的 AI 测试助手，运行在本机 QA 工作台中，与测试团队协作完成软件测试工作。

【本项目辅助策略】
${modeInstruction}

【工作方式】
1. 用户对话中出现的需求、可测场景、缺陷、里程碑、日程、测试结论，必须立即用对应工具登记到项目，不要只写在回复里。
2. 提到的新需求/范围用 requirement_add 登记并给出验收标准；可测场景用 testcase_add 生成测试用例（选择合适 kind 与 priority，P0/P1 用于核心流程与高风险场景）。
3. 发现的不符合预期行为用 defect_add 登记（严重级别 critical/major/minor/trivial，写明复现步骤、预期与实际结果），缺陷状态用 defect_status 跟进。
4. 起草报告：report_draft 创建记录 → 在回复中写出全文 → report_draft_save 保存为草稿版本。
5. 测试经验、历史缺陷模式、规范结论用 knowledge_save 沉淀；重要讨论结论用 minutes_save 存档。
6. 项目阶段用 project_transition 推进看板；发布只能由测试负责人人工操作。门禁（用例评审/发布/结项）只能 gate_request 提交，由负责人在界面审批。
7. 需求与用例用 testcase_link 关联并写明覆盖的验证点。
8. 用户提供 Playwright/Pytest 等自动化结果时，用 testrun_import 登记执行汇总。

【红线】
- 绝不编造需求、缺陷、数据、日期、测试结论；不确定就说不确定并请用户核对。
- 涉及严重级别、截止日期、缺陷归属、发布决策的表述，必须复述给用户确认。
- 你只登记与起草，定稿、审批、发布等最终动作一律由测试负责人完成。

【当前项目快照】（实时）
${snapshot}

请用中文回复，专业、简洁、有结构；关键术语可附英文。`;
}

// 流式调用 DeepSeek，解析 SSE，累积文本与工具调用
async function streamChat(messages, cfg, onDelta, toolsEnabled = true) {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      ...(toolsEnabled ? { tools: TOOL_DEFS } : {}),
      stream: true,
      temperature: cfg.temperature,
    }),
  });
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try { msg = (await resp.json()).error?.message || msg; } catch { /* ignore */ }
    throw new Error(`DeepSeek API 调用失败：${msg}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  const toolCalls = [];
  let finished = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') { finished = true; break; }
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta || {};
        if (delta.content) { content += delta.content; onDelta?.(delta.content); }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const i = tc.index ?? 0;
            toolCalls[i] ||= { id: '', name: '', arguments: '' };
            if (tc.id) toolCalls[i].id = tc.id;
            if (tc.function?.name) toolCalls[i].name += tc.function.name;
            if (tc.function?.arguments) toolCalls[i].arguments += tc.function.arguments;
          }
        }
      } catch { /* 忽略无法解析的分片 */ }
    }
    if (finished) break;
  }
  return { content, toolCalls: toolCalls.filter((t) => t.name || t.id), finished };
}

// 单轮 agent 执行：用户消息 → 工具循环 → 最终回复；所有变更实时广播
export async function runTurn(projectId, text, { turnId, isCancelled = () => false, model } = {}) {
  const cfg = { ...loadConfig() };
  const p = store.getProject(projectId);
  if (!p) throw new Error('项目不存在');
  if (!cfg.apiKey) throw new Error('尚未配置 DeepSeek API Key，请先在设置中配置');
  if (typeof model === 'string' && model.trim()) cfg.model = model.trim();
  else if (p.aiModel) cfg.model = p.aiModel;

  turnId ||= store.uid('turn');
  p.aiActive = true;
  store.touch(p);
  store.persist();
  broadcast('ai.start', { projectId, turnId, model: cfg.model });
  broadcast('project.updated', { project: projectCard(p) });

  const conv = store.loadConv(projectId);
  conv.messages.push({ role: 'user', content: text, at: store.now() });

  const messages = [{ role: 'system', content: buildSystemPrompt(p) }, ...conv.messages.slice(-40).map(stripTools)];
  const toolsUsed = [];
  let finalText = '';

  try {
    for (let round = 0; round < cfg.maxToolRounds; round++) {
      if (isCancelled()) { finalText = '（已停止）'; break; }
      const res = await streamChat(messages, cfg, (d) => broadcast('chat.delta', { projectId, turnId, text: d }), p.assistant?.enabled !== false);

      if (res.toolCalls.length) {
        const assistantMsg = { role: 'assistant', content: res.content || '', tool_calls: res.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } })) };
        messages.push(assistantMsg);
        for (const tc of res.toolCalls) {
          let args = {};
          try { args = JSON.parse(tc.arguments || '{}'); } catch { args = { _raw: tc.arguments }; }
          const cn = TOOL_CN[tc.name] || tc.name;
          broadcast('ai.tool', { projectId, turnId, name: tc.name, cn, args });
          const feedEntry = store.addFeed({ projectId, projectTitle: p.title, type: 'tool', label: `AI 调用工具：${cn}` });
          broadcast('feed', { entry: feedEntry });
          let result;
          try { result = await executeTool(projectId, tc.name, args); }
          catch (e) { result = { ok: false, error: String(e?.message || e) }; }
          toolsUsed.push({ name: tc.name, args });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 6000) });
          if (isCancelled()) break;
        }
        if (isCancelled()) { finalText = '（已停止）'; break; }
        continue;
      }

      // 纯文本回复
      conv.messages.push({ role: 'assistant', content: res.content || '', at: store.now() });
      finalText = res.content || '';
      break;
    }
  } catch (e) {
    const msg = String(e?.message || e);
    broadcast('chat.error', { projectId, turnId, message: msg });
    conv.messages.push({ role: 'assistant', content: `⚠️ 调用出错：${msg}`, at: store.now() });
    throw e;
  } finally {
    p.aiActive = false;
    store.touch(p);
    store.persist();
    broadcast('project.updated', { project: projectCard(p) });
    broadcast('ai.end', { projectId, turnId });
  }

  store.saveConv(projectId, conv);
  broadcast('chat.done', { projectId, turnId, text: finalText, toolCount: toolsUsed.length, model: cfg.model });
  return { turnId, text: finalText, tools: toolsUsed };
}

function stripTools(m) {
  if (m.tool_calls) { const { tool_calls, ...rest } = m; return rest; }
  return m;
}
