import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, lstat, chmod, symlink, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { cachedCredential, openRouterCredential, importEnvironmentCredential } from '../src/adapters/models/credentials.js';

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

test('explicit environment capture survives environment removal and clears the failed lookup marker', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ci-env-import-'));
  try {
    process.env.OPENROUTER_API_KEY = 'synthetic-environment-key';
    await writeFile(path.join(directory, 'op-failed'), 'previous failure');
    assert.equal(await importEnvironmentCredential(directory, false), 'file');
    delete process.env.OPENROUTER_API_KEY;
    assert.equal(await openRouterCredential(directory, false, async () => { throw new Error('1Password must not run'); }), 'synthetic-environment-key');
    await assert.rejects(access(path.join(directory, 'op-failed')));
    await assert.rejects(importEnvironmentCredential(directory, false), /CREDENTIAL_FORMAT/);
    assert.equal(await cachedCredential(directory, false), 'synthetic-environment-key');
  } finally { if (previous === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous; }
});
test('credential import rejects a symlink directory before chmod or lock creation', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  const root = await mkdtemp(path.join(os.tmpdir(), 'ci-env-symlink-')), target = path.join(root, 'target'), link = path.join(root, 'link');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(target, { mode: 0o755 }); await chmod(target, 0o755); await symlink(target, link);
  try {
    process.env.OPENROUTER_API_KEY = 'synthetic-environment-key';
    await assert.rejects(importEnvironmentCredential(link, false), /CREDENTIAL_PERMISSIONS/);
    assert.equal((await lstat(target)).mode & 0o777, 0o755);
    await assert.rejects(access(path.join(target, '.lock')));
  } finally { if (previous === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous; }
});
