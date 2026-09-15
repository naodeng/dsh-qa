import { test, expect } from '@playwright/test';

test.describe('Workbench follow reconnect', () => {
  test('failed local follow cleans up and a reload returns to a usable workbench', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const { openFollowSnapshot } = await import('/dsh-rpc-contract.js');
      const listeners = new Map();
      const socket = {
        sent: [],
        closeCalls: 0,
        addEventListener(type, listener) {
          const values = listeners.get(type) || new Set();
          values.add(listener);
          listeners.set(type, values);
        },
        removeEventListener(type, listener) {
          listeners.get(type)?.delete(listener);
        },
        emit(type, event = {}) {
          for (const listener of [...(listeners.get(type) || [])]) listener(event);
        },
        send(payload) {
          this.sent.push(payload);
        },
        close() {
          this.closeCalls += 1;
        },
      };

      const promise = openFollowSnapshot(socket, {
        streamId: 'browser-stream',
        sessionId: 'browser-session',
        timeoutMs: 100,
      });
      socket.emit('open');
      socket.emit('message', { data: JSON.stringify({ streamId: 'other-stream', type: 'done' }) });
      socket.emit('close');
      let error = '';
      try {
        await promise;
      } catch (caught) {
        error = caught.message;
      }
      return {
        error,
        closeCalls: socket.closeCalls,
        listeners: Object.fromEntries([...listeners].map(([type, values]) => [type, values.size])),
        sent: JSON.parse(socket.sent[0]),
      };
    });

    expect(result.error).toContain('WebSocket 已关闭');
    expect(result.closeCalls).toBe(1);
    expect(result.listeners).toEqual({ open: 0, message: 0, error: 0, close: 0 });
    expect(result.sent).toMatchObject({
      type: 'open',
      streamId: 'browser-stream',
      endpoint: 'session/follow',
    });

    await page.reload();
    await expect(page.locator('#metric-cards')).toBeVisible();
    await expect(page.locator('#dashboard-cases .case-overview-row')).not.toHaveCount(0);
  });
});
