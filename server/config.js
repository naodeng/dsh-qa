// 质量工作台本地配置：对话模型与凭据统一由 DSH 管理
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.QA_DATA_DIR || path.join(ROOT, 'data');
export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
export const DATA_PATH = path.join(DATA_DIR, 'data.json');
export const CONV_DIR = path.join(DATA_DIR, 'conv');

export const DEFAULTS = {
  port: 8899,
  host: '127.0.0.1',
};

export function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(CONV_DIR, { recursive: true });
}

export function loadConfig() {
  ensureDirs();
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { /* first run */ }
  return {
    ...DEFAULTS,
    port: Number.isFinite(Number(cfg.port)) ? Number(cfg.port) : DEFAULTS.port,
    host: typeof cfg.host === 'string' && cfg.host ? cfg.host : DEFAULTS.host,
  };
}

export function saveConfig(cfg) {
  ensureDirs();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export function publicSettings(cfg) {
  return {
    host: cfg.host,
    dshManaged: true,
    modelNotice: '工作台对话统一使用 DSH 测试模式；模型、技能、命令与权限都跟随本项目的 DSH 原生会话。',
  };
}
