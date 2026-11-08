import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { atomic, json, pause } from '../../util.js';

/** Limits concurrent controller requests across CLI processes sharing a data root. */
export async function slot(root: string, id: string, limit: number, signal?: AbortSignal) {
  const directory = path.join(root, 'ci-slots'); await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${id}.json`), mutex = path.join(directory, '.mutex');
  for (;;) {
    if (signal?.aborted) throw new Error('CANCELLED');
    let locked = false;
    try { await mkdir(mutex); locked = true; } catch {}
    if (!locked) { await pause(50, signal); continue; }
    try {
      const files = (await readdir(directory)).filter(name => name.endsWith('.json'));
      if (files.includes(`${id}.json`)) {
        const owner = JSON.parse(await readFile(file, 'utf8')) as { pid: number };
        if (owner.pid !== process.pid) { try { process.kill(owner.pid, 0); throw new Error('CI_SLOT_BUSY: same dispatch is owned by another live process'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; } }
        await atomic(file, json({ pid: process.pid, id }));
        return async () => { await rm(file, { force: true }); };
      }
      if (files.length < limit) { await atomic(file, json({ pid: process.pid, id })); return async () => { await rm(file, { force: true }); }; }
    } finally { await rm(mutex, { recursive: true }); }
    await pause(100, signal);
  }
}
