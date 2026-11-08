import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, open, realpath } from 'node:fs/promises';
import path from 'node:path';

export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
export const now = () => new Date().toISOString();
export const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, 'utf8'));
export async function atomic(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
  await rename(temp, file);
  const directory = await open(path.dirname(file), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
export function within(root: string, candidate: string) { const relative = path.relative(root, candidate); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
export async function separate(lab: string, target: string, data: string) {
  const a = await realpath(lab), b = await realpath(target);
  await mkdir(data, { recursive: true }); const c = await realpath(data);
  if (within(a, b) || within(b, a) || within(b, c) || within(c, b)) throw new Error('ISOLATION: target, lab, and run data must be separate');
}
export function command(binary: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number; signal?: AbortSignal; input?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'], signal: options.signal, timeout: options.timeout ?? 120000 });
    let stdout = '', stderr = '', size = 0;
    child.stdout.on('data', (data: Buffer) => { size += data.length; if (size > 8_000_000) child.kill(); else stdout += data; });
    child.stderr.on('data', (data: Buffer) => { if (stderr.length < 16000) stderr += data; });
    child.on('error', reject);
    child.on('close', (code, signal) => code === 0 ? resolve(stdout) : reject(new Error(`${binary}: ${signal ?? code}: ${redact(stderr || (binary === 'opencode' ? stdout : '')).slice(0, 1000)}`)));
    child.stdin.end(options.input);
  });
}
export const redact = (value: string) => value.replace(/(?:sk-or-v1-|gh[pousr]_)[A-Za-z0-9_-]+/g, '[REDACTED]').replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
export const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new Error('CANCELLED')); return; }
  const abort = () => { clearTimeout(timer); reject(new Error('CANCELLED')); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  signal?.addEventListener('abort', abort, { once: true });
});
