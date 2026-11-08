import { chmod, lstat, mkdir, readFile, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { atomic, command, pause } from '../../util.js';

const service = 'ci-optimization-lab', account = 'openrouter';
const fromOp = () => command('op', ['item', 'get', 'OpenRouter API Key - self-host', '--fields', 'label=credential', '--reveal'], { timeout: 15000 });
export const credentialDirectory = path.join(os.homedir(), '.local/share/ci-optimization-lab/credentials');
async function unlockedKeyring() {
  try {
    const owner = await command('gdbus', ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.NameHasOwner', 'org.freedesktop.secrets'], { timeout: 1500 });
    if (!owner.includes('true')) return false;
    const locked = await command('gdbus', ['call', '--session', '--dest', 'org.freedesktop.secrets', '--object-path', '/org/freedesktop/secrets/aliases/default', '--method', 'org.freedesktop.DBus.Properties.Get', 'org.freedesktop.Secret.Collection', 'Locked'], { timeout: 1500 });
    return locked.includes('false');
  } catch { return false; }
}
export async function cachedCredential(directory = credentialDirectory, useKeyring = true): Promise<string | null> {
  const environment = process.env.OPENROUTER_API_KEY?.trim(); if (environment) return environment;
  return persistedCredential(directory, useKeyring);
}
async function persistedCredential(directory: string, useKeyring: boolean): Promise<string | null> {
  const file = path.join(directory, 'openrouter');
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) throw new Error('CREDENTIAL_PERMISSIONS: credential must be owned by this user and mode 0600');
    const key = (await readFile(file, 'utf8')).trim(); if (key) return key;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (useKeyring && await unlockedKeyring()) {
    try { const key = (await command('secret-tool', ['lookup', 'service', service, 'account', account], { timeout: 2000 })).trim(); if (key) return key; } catch {}
  }
  return null;
}
export async function persistCredential(key: string, directory = credentialDirectory, useKeyring = true) {
  if (!key.trim() || /\s/.test(key.trim())) throw new Error('CREDENTIAL_FORMAT: empty or malformed credential');
  await prepareDirectory(directory);
  if (useKeyring && await unlockedKeyring()) {
    try { await command('secret-tool', ['store', '--label=CI optimization lab OpenRouter', 'service', service, 'account', account], { input: key.trim(), timeout: 2000 }); await rm(path.join(directory, 'openrouter'), { force: true }); return 'keyring'; } catch {}
  }
  await atomic(path.join(directory, 'openrouter'), key.trim() + '\n'); await chmod(path.join(directory, 'openrouter'), 0o600);
  return 'file';
}
async function prepareDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== process.getuid?.()) throw new Error('CREDENTIAL_PERMISSIONS: unsafe cache directory');
  await chmod(directory, 0o700);
}
async function credentialLock<T>(directory: string, action: () => Promise<T>) {
  await prepareDirectory(directory);
  const lock = path.join(directory, '.lock');
  for (let tries = 0; ; tries++) {
    try { await mkdir(lock); await atomic(path.join(lock, 'pid'), String(process.pid)); break; }
    catch {
      if (tries > 400) throw new Error('AUTH_BLOCKED: credential lookup lock is busy; no repeated 1Password request');
      try { const pid = Number(await readFile(path.join(lock, 'pid'), 'utf8')); process.kill(pid, 0); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') { await rm(lock, { recursive: true }); continue; } }
      await pause(50);
    }
  }
  try { return await action(); } finally { await rm(lock, { recursive: true, force: true }); }
}
export async function openRouterCredential(directory = credentialDirectory, useKeyring = true, fetchFromOp: () => Promise<string> = fromOp) {
  const cached = await cachedCredential(directory, useKeyring); if (cached) return cached;
  return credentialLock(directory, async () => {
    const again = await cachedCredential(directory, useKeyring); if (again) return again;
    try { await lstat(path.join(directory, 'op-failed')); throw new Error('AUTH_BLOCKED: prior 1Password lookup failed; run credentials refresh explicitly after signing in'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    try { const key = (await fetchFromOp()).trim(); await persistCredential(key, directory, useKeyring); return key; }
    catch { await atomic(path.join(directory, 'op-failed'), 'Credential lookup failed; no secret retained.\n'); throw new Error('AUTH_BLOCKED: 1Password credential unavailable; no repeated automatic lookup'); }
  });
}
export async function importEnvironmentCredential(directory = credentialDirectory, useKeyring = true) {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key || /\s/.test(key)) throw new Error('CREDENTIAL_FORMAT: OPENROUTER_API_KEY is empty or malformed');
  return credentialLock(directory, async () => {
    const storage = await persistCredential(key, directory, useKeyring);
    if (await persistedCredential(directory, useKeyring) !== key) throw new Error('CREDENTIAL_VERIFY: persisted credential readback failed');
    await rm(path.join(directory, 'op-failed'), { force: true });
    return storage;
  });
}
export async function refreshCredential(directory = credentialDirectory, useKeyring = true, fetchFromOp: () => Promise<string> = fromOp) {
  return credentialLock(directory, async () => {
    let replacement: string;
    try { replacement = (await fetchFromOp()).trim(); if (!replacement || /\s/.test(replacement)) throw new Error('invalid replacement'); }
    catch { throw new Error('AUTH_BLOCKED: replacement capture failed; previous cached key retained'); }
    await persistCredential(replacement, directory, useKeyring);
    await rm(path.join(directory, 'op-failed'), { force: true });
  });
}
export async function removeCredential() {
  await rm(path.join(credentialDirectory, 'openrouter'), { force: true }); await rm(path.join(credentialDirectory, 'op-failed'), { force: true });
  if (await unlockedKeyring()) await command('secret-tool', ['clear', 'service', service, 'account', account], { timeout: 2000 }).catch(() => {});
}
