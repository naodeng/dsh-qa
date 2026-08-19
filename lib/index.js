/**
 * dsh-qa 宿主半：在 DeepSeek Harness 进程内拉起「质量工作台」，
 * 注册 /api/dsh-qa 路由族（loopback 护栏 + 同源镜像），并向 agent
 * 系统提示播报工作台入口。零 npm 依赖（仅 node 内建模块）。
 *
 * 路由：
 *   GET  /api/dsh-qa/info            工作台状态（URL/端口/数据目录）
 *   GET  /api/dsh-qa/workbench       302 → workbench/（同源 iframe 用）
 *   ANY  /api/dsh-qa/workbench/*     反向代理到本机工作台服务（含 SSE 流式）
 *
 * 数据目录：~/.dsh/dsh-qa（每个用户独立）。
 */
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

export const name = 'dsh-qa';
export const inject = ['webServer', 'systemPrompt'];

const BASE = '/api/dsh-qa';
const PLUGIN_DATA_DIR = path.join(os.homedir(), '.dsh', 'dsh-qa');

const ANNOUNCEMENT = `【质量工作台 QA Workbench（dsh-qa 插件）】
本机安装了「质量工作台」AI 软件测试应用，入口在 GUI 侧边栏「质量工作台」（点击在会话区打开，也可工具栏「在标签页打开」）。
功能：测试工作台首页（待办/提醒、日历排期、项目与迭代概览、最近动态）；测试项目与迭代双形态管理；六列 QA 看板（需求分析/用例设计/用例评审/执行中/缺陷回归/已发布）；每项目独立 AI 对话与项目雷达；AI 可按项目选择全流程辅助、按需协作或关闭；需求/测试用例/缺陷/里程碑/测试报告实时沉淀；门禁（用例评审/发布/结项）由测试负责人人工审批；可自动创建本地测试工作目录。
模型与能力：工作台对话统一使用 DSH 原生会话，不提供插件内独立模型或 API 配置。每个测试项目以项目文件夹为 cwd 创建独立会话，并自动使用 DSH 的「测试模式」（preset id: qa）；可直接调用用户已安装的 DSH 技能、斜杠命令、工具、模型与权限策略，模型切换也只读取 DSH 当前目录。
界面与 Remote：主导航、项目栏、对话区和项目雷达支持拖拽调宽、收起和布局预设。右上角可切换「质量仪表」「终端」「极简」「赛博」四套皮肤。Remote 入口复用 DSH 自带的 dsh-remote-web-ui 配对接口，可显示局域网状态、生成一次性配对链接和打开手机端页面。
注意：项目业务数据存于 ~/.dsh/dsh-qa/data，项目文件存于该目录下的 project-workspaces；项目对话由 DSH 原生持久化。用户提到「质量工作台 / dsh-qa / 看板」时即指本插件。`;

/** Loopback 护栏：本插件读写用户本机测试数据，仅放行本机浏览器请求。 */
function isLoopbackRequest(req) {
  const address = req.socket?.remoteAddress;
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false;
  const host = req.headers.host;
  if (typeof host !== 'string') return false;
  let hostUrl;
  try { hostUrl = new URL(`http://${host}`); } catch { return false; }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostUrl.hostname)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try { return new URL(origin).host === hostUrl.host; } catch { return false; }
}

function writeJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

export function apply(ctx, config = {}) {
  const log = (msg) => {
    try { ctx.logger?.info(msg); } catch { console.log(`[dsh-qa] ${msg}`); }
  };

  ctx.effect(async () => {
    const disposeSection = config.announceToAgent !== false
      ? ctx.systemPrompt.section({ name: 'plugin:dsh-qa', order: 215, text: ANNOUNCEMENT })
      : undefined;
    const routeDisposers = [];

    // 数据目录经环境变量注入，必须在动态 import 服务端前设置。
    process.env.QA_DATA_DIR ??= config.dataDir || PLUGIN_DATA_DIR;

    let state = { port: null, config: null, close: null, error: null };
    try {
      const { startQaBench, closeQaBench } = await import('../server/index.js');
      const boot = await startQaBench({ port: Number(config.port) || 8899, openBrowser: false, log });
      state = { port: boot.port, config: boot.config, close: () => closeQaBench(boot.server), error: null };
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      log(`[dsh-qa] 工作台启动失败（路由降级为 503）：${state.error}`);
    }

    routeDisposers.push(ctx.webServer.register({
      kind: 'exact',
      path: `${BASE}/info`,
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) return writeJson(res, 403, { ok: false, error: 'loopback only' });
        if (state.error) return writeJson(res, 503, { ok: false, error: state.error });
        writeJson(res, 200, { ok: true, url: `http://127.0.0.1:${state.port}/`, port: state.port, dataDir: state.config?.dataDir || PLUGIN_DATA_DIR });
      },
    }));

    routeDisposers.push(ctx.webServer.register({
      kind: 'exact',
      path: `${BASE}/workbench`,
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) return writeJson(res, 403, { ok: false, error: 'loopback only' });
        res.writeHead(302, { Location: `${BASE}/workbench/` });
        res.end();
      },
    }));

    routeDisposers.push(ctx.webServer.register({
      kind: 'prefix',
      path: `${BASE}/workbench`,
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) return writeJson(res, 403, { ok: false, error: 'loopback only' });
        if (state.error) return writeJson(res, 503, { ok: false, error: state.error });
        const url = new URL(req.url, 'http://x');
        const targetPath = url.pathname.slice(`${BASE}/workbench`.length) || '/';
        const headers = { ...req.headers, host: `127.0.0.1:${state.port}` };
        const upstream = http.request({ host: '127.0.0.1', port: state.port, path: targetPath + url.search, method: req.method, headers }, (uRes) => {
          res.writeHead(uRes.statusCode ?? 502, uRes.headers);
          uRes.pipe(res);
        });
        upstream.on('error', (e) => {
          if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          if (!res.writableEnded) res.end(`qa workbench proxy error: ${e?.message || e}`);
        });
        res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
        req.pipe(upstream);
      },
    }));

    log(`[dsh-qa] 插件就绪${state.error ? `（降级：${state.error}）` : `：http://127.0.0.1:${state.port}`}`);

    return () => {
      disposeSection?.();
      for (const dispose of routeDisposers.splice(0)) dispose();
      if (state.close) void state.close();
    };
  }, 'dsh-qa: workbench server + routes');
}
