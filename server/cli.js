// 独立运行入口：node server/cli.js
process.env.QA_DATA_DIR ??= new URL('../data', import.meta.url).pathname;

const { startQaBench } = await import('./index.js');

const requestedPort = Number.parseInt(process.env.QA_PORT || '8899', 10);
const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 8899;

console.log('  质量工作台 · QA Workbench（独立模式）');
console.log('  插件模式请通过 dsh-qa 插件在 DeepSeek Harness 中使用\n');

const { server } = await startQaBench({ port, openBrowser: true });

function shutdown() {
  import('./index.js').then(({ closeQaBench }) => {
    closeQaBench(server).then(() => process.exit(0));
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
