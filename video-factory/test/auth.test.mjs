import test from 'node:test';
import assert from 'node:assert/strict';
import { issueDeviceSession, normalizeActivationCode, sha256Hex, verifyAdminKey, verifyDeviceSession } from '../src/auth.ts';

test('activation codes normalize without weakening their value', () => {
  assert.equal(normalizeActivationCode('ab12-cd34 ef56'), 'AB12CD34EF56');
});

test('activation code hashes are stable and do not contain the source', async () => {
  const digest = await sha256Hex('OWNERACCESSCODE123456');
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(digest, /OWNER/);
});

test('admin key comparison accepts only the configured secret', async () => {
  assert.equal(await verifyAdminKey('correct', 'correct'), true);
  assert.equal(await verifyAdminKey('wrong', 'correct'), false);
});

test('device sessions are signed, expire, and reject tampering', async () => {
  const now = Date.UTC(2026, 7, 3);
  const { token } = await issueDeviceSession('test-secret', now, 60);
  assert.equal(await verifyDeviceSession(token, 'test-secret', now + 30_000), true);
  assert.equal(await verifyDeviceSession(token, 'other-secret', now + 30_000), false);
  assert.equal(await verifyDeviceSession(`${token}x`, 'test-secret', now + 30_000), false);
  assert.equal(await verifyDeviceSession(token, 'test-secret', now + 61_000), false);
});
