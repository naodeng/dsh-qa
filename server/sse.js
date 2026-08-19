// SSE 实时事件总线：所有变更推送到浏览器看板
const clients = new Set();

export function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const c = { res, alive: true };
  clients.add(c);
  const ping = setInterval(() => {
    if (c.alive) { try { c.res.write(': ping\n\n'); } catch { /* ignore */ } }
  }, 25000);
  req.on('close', () => {
    c.alive = false;
    clearInterval(ping);
    clients.delete(c);
  });
  broadcast('hello', { ts: Date.now() });
}

export function broadcast(type, payload) {
  const data = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) {
    if (!c.alive) { clients.delete(c); continue; }
    try { c.res.write(data); } catch { c.alive = false; clients.delete(c); }
  }
}
