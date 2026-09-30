import test from 'node:test';
import assert from 'node:assert/strict';
import { dismissHarnessPreviewNotice, parseHostLaunchUrl } from '../support/dsh-host-auth.js';

test('accepts the authenticated dsh web launch URL and exposes only its origin', () => {
  const parsed = parseHostLaunchUrl('http://127.0.0.1:3080/?token=launch-secret');

  assert.deepEqual(parsed, {
    launchUrl: 'http://127.0.0.1:3080/?token=launch-secret',
    origin: 'http://127.0.0.1:3080',
  });
});

test('rejects a bare dsh web origin because a fresh browser has no auth cookie', () => {
  assert.throws(
    () => parseHostLaunchUrl('http://127.0.0.1:3080/'),
    /full authenticated URL printed by dsh web.*token/i,
  );
});

test('dismisses the optional Harness preview notice before Host Smoke actions', async () => {
  let visible = true;
  const dialog = {
    async waitFor({ state }) {
      if (state === 'visible') assert.equal(visible, true);
      if (state === 'hidden') assert.equal(visible, false);
    },
    getByRole(role, options) {
      assert.equal(role, 'button');
      assert.match('继续', options.name);
      return {
        async click() {
          visible = false;
        },
      };
    },
  };
  const page = {
    getByRole(role) {
      assert.equal(role, 'dialog');
      return {
        filter({ hasText }) {
          assert.match('预览版说明', hasText);
          return dialog;
        },
      };
    },
  };

  assert.equal(await dismissHarnessPreviewNotice(page), true);
  assert.equal(visible, false);
});
