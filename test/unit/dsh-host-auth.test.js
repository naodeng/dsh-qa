import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHostLaunchUrl } from '../support/dsh-host-auth.js';

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
