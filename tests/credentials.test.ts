import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, lstat, chmod } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { cachedCredential, openRouterCredential } from '../src/adapters/models/credentials.js';

test('concurrent credential requests capture once and reuse a user-only cache without printing secrets', async () => {
  const previous = process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY;
  try {
    const directory = path.join(await mkdtemp(path.join(os.tmpdir(), 'ci-lab-credentials-')), 'credentials'); let calls = 0;
    const fetchKey = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 20)); return 'fixture-key-not-a-secret'; };
    const values = await Promise.all(Array.from({ length: 4 }, () => openRouterCredential(directory, false, fetchKey)));
    assert.equal(calls, 1); assert.ok(values.every(value => value === 'fixture-key-not-a-secret'));
    assert.equal((await lstat(directory)).mode & 0o777, 0o700); assert.equal((await lstat(path.join(directory, 'openrouter'))).mode & 0o777, 0o600);
    await chmod(path.join(directory, 'openrouter'), 0o644); await assert.rejects(cachedCredential(directory, false), /PERMISSIONS/);
  } finally { if (previous !== undefined) process.env.OPENROUTER_API_KEY = previous; }
});
test('failed credential capture prevents repeated 1Password lookups', async () => {
  const previous = process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY;
  try {
    const directory = path.join(await mkdtemp(path.join(os.tmpdir(), 'ci-lab-auth-failure-')), 'credentials'); let calls = 0;
    const fail = async () => { calls++; throw new Error('account is not signed in'); };
    await assert.rejects(openRouterCredential(directory, false, fail), /AUTH_BLOCKED/);
    await assert.rejects(openRouterCredential(directory, false, fail), /prior 1Password lookup failed/); assert.equal(calls, 1);
  } finally { if (previous !== undefined) process.env.OPENROUTER_API_KEY = previous; }
});
