// 质量工作台服务端：可嵌入（dsh-qa 插件）或独立运行（server/cli.js）
import http from 'node:http';
import { loadConfig, publicSettings, DATA_DIR } from './config.js';
import * as store from './store.js';
import { seedIfEmpty } from './seed.js';
import { handleRequest } from './routes.js';
import { recoverEvidenceFinalization } from './quality/evidence.js';
import { startArtifactCleanupWorker, recoverOrphanStaging } from './quality/evidence-retention.js';

const workers = new WeakMap();

/**
 * 启动工作台服务。
 * @param {object} opts
 * @param {string} [opts.dataDir]   数据目录（必须在动态 import 本模块前经 QA_DATA_DIR 注入）
 * @param {number} [opts.port]      首选端口，占用时自动 +1（最多 +10）
 * @param {boolean} [opts.openBrowser] 启动成功后用系统浏览器打开（macOS）
 * @param {(msg: string) => void} [opts.log]
 * @returns {Promise<{port:number, server:import('node:http').Server, config:object}>}
 */
export function startQaBench(opts = {}) {
  const { port: wantPort = 8899, openBrowser = true, log = console.log } = opts;
  const cfg = loadConfig();
  store.loadStore();
  seedIfEmpty();
  recoverEvidenceFinalization(store.listProjects()).catch(() => {});
  recoverOrphanStaging(store.listProjects()).catch(() => {});
  const cleanupWorker = startArtifactCleanupWorker({ jobs: store.listArtifactCleanupJobs() });

  const server = http.createServer((req, res) => {
    try { handleRequest(req, res); }
    catch (e) { res.writeHead(500); res.end(String(e?.message || e)); }
  });

  return new Promise((resolve, reject) => {
    const listen = (port) => {
      const onListening = () => {
        server.off('error', onError);
        workers.set(server, cleanupWorker);
        const s = publicSettings(cfg);
        log(`[dsh-qa] 质量工作台已启动：http://127.0.0.1:${port}（DSH 测试模式，数据 ${DATA_DIR}）`);
        if (openBrowser && process.platform === 'darwin') {
          try { import('node:child_process').then(({ execFile }) => execFile('open', [`http://127.0.0.1:${port}`])); } catch { /* ignore */ }
        }
        resolve({ port, server, config: { ...s, dataDir: DATA_DIR } });
      };
      const onError = (e) => {
        server.off('listening', onListening);
        if (e.code === 'EADDRINUSE' && port < wantPort + 10) {
          log(`[dsh-qa] 端口 ${port} 被占用，尝试 ${port + 1}…`);
          listen(port + 1);
        } else {
          reject(e);
        }
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, cfg.host);
    };
    listen(wantPort);
  });
}

export function closeQaBench(server) {
  return new Promise((resolve) => {
    workers.get(server)?.stop();
    workers.delete(server);
    store.flush();
    if (!server?.listening) return resolve();
    server.close(() => resolve());
  });
}
