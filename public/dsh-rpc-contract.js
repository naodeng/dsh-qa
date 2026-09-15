export function createClientRequest(rpcId, method, args = {}) {
  return {
    type: 'client-request',
    rpcId,
    method,
    payload: { args },
  };
}

export function createFollowOpen(streamId, sessionId, maxMessages = 30) {
  return {
    type: 'open',
    streamId,
    endpoint: 'session/follow',
    payload: {
      args: {
        request: {
          address: { kind: 'session', sessionId },
          maxMessages,
        },
      },
    },
  };
}

export function parseFollowSnapshot(frame) {
  const snapshot = frame?.snapshot || frame;
  return {
    records: Array.isArray(snapshot?.records) ? snapshot.records : [],
    cursor: Number.isInteger(snapshot?.cursor) ? snapshot.cursor : -1,
  };
}

export function openFollowSnapshot(socket, {
  streamId,
  sessionId,
  maxMessages = 30,
  timeoutMs = 10_000,
} = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('close', onClose);
    };
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      try { socket.close(); } catch { /* ignore */ }
      handler(value);
    };
    const onOpen = () => {
      if (!settled) socket.send(JSON.stringify(createFollowOpen(streamId, sessionId, maxMessages)));
    };
    const onMessage = (event) => {
      let frame;
      try { frame = JSON.parse(event.data); } catch { return; }
      if (!frame || typeof frame !== 'object' || frame.streamId !== streamId) return;
      if (frame.type === 'item' && frame.value?.type === 'snapshot') {
        finish(resolve, parseFollowSnapshot(frame.value));
        return;
      }
      if (frame.type === 'error') {
        finish(reject, new Error(frame.error?.message || 'DSH 会话快照失败'));
        return;
      }
      if (frame.type === 'done' || frame.type === 'end') {
        finish(reject, new Error('DSH 会话快照未收到'));
      }
    };
    const onError = () => finish(reject, new Error('DSH 会话 WebSocket 连接失败'));
    const onClose = () => finish(reject, new Error('DSH 会话 WebSocket 已关闭'));
    socket.addEventListener('open', onOpen);
    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', onError);
    socket.addEventListener('close', onClose);
    timer = setTimeout(() => finish(reject, new Error('DSH 会话快照超时')), timeoutMs);
  });
}
