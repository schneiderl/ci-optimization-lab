import { mkdir, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { Envelope, State, type ArtifactRef, type RunState, type Outcome } from '../../contracts/index.js';
import { atomic, digest, json, now, pause } from '../../util.js';

export class Store {
  constructor(readonly root: string) {}
  async lock(): Promise<() => Promise<void>> {
    await mkdir(this.root, { recursive: true });
    const lock = path.join(this.root, '.lock');
    try { await mkdir(lock); }
    catch {
      try { const pid = Number(await readFile(path.join(lock, 'pid'), 'utf8')); process.kill(pid, 0); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') { await rm(lock, { recursive: true }); return this.lock(); } }
      throw new Error('LOCKED: another process owns this run; inspect .lock/pid before recovery');
    }
    await atomic(path.join(lock, 'pid'), String(process.pid));
    return () => rm(lock, { recursive: true, force: true });
  }
  async load(): Promise<RunState | null> { try { return State.parse(JSON.parse(await readFile(path.join(this.root, 'state.json'), 'utf8'))); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; } }
  async save(state: RunState, status: Outcome = state.status) {
    state.status = status; state.sequence++; state.updatedAt = now(); State.parse(state);
    await atomic(path.join(this.root, 'events', `${String(state.sequence).padStart(6, '0')}.json`), json(state));
    await atomic(path.join(this.root, 'state.json'), json(state));
  }
  async put(name: string, data: unknown, commit: string | null = null, patch: string | null = null): Promise<ArtifactRef> {
    const content = json(data), sha256 = digest(content), file = `artifacts/${name}-${sha256}.json`;
    await atomic(path.join(this.root, file), content);
    return { path: file, sha256, targetCommit: commit, patchDigest: patch };
  }
  async get<T>(ref: ArtifactRef, schema: z.ZodType<T>): Promise<T> {
    if (!/^artifacts\/[\w.-]+\.json$/.test(ref.path)) throw new Error('ARTIFACT: invalid reference');
    const content = await readFile(path.join(this.root, ref.path), 'utf8');
    if (digest(content) !== ref.sha256) throw new Error('ARTIFACT: digest mismatch');
    return schema.parse(JSON.parse(content));
  }
  async block<T>(state: RunState, name: string, schema: z.ZodType<T>, inputs: ArtifactRef[], action: () => Promise<NoInfer<T>>, commit: string | null = null, patch: string | null = null): Promise<T> {
    const key = `${state.cycle}-${name}`;
    if (state.artifacts[key]) return this.get(state.artifacts[key], schema);
    const output = schema.parse(await action());
    const ref = await this.put(key, output, commit, patch);
    const envelope = Envelope.parse({ schemaVersion: 1, runId: state.runId, stepId: name, attemptId: `cycle-${state.cycle}`, inputs, outputs: [ref] });
    state.artifacts[key] = ref;
    state.artifacts[`${key}-envelope`] = await this.put(`${key}-envelope`, envelope, commit, patch);
    await this.save(state);
    return output;
  }
}

const LedgerSchema = z.object({ schemaVersion: z.literal(1), ceilingUsd: z.number().max(30), experiments: z.record(z.string(), z.number().positive()).default({}), entries: z.record(z.string(), z.object({ reservedUsd: z.number().nonnegative(), chargedUpperBoundUsd: z.number().nonnegative().nullable(), reason: z.string(), experimentId: z.string().optional() })) });
export class Budget {
  constructor(readonly root: string, readonly ceiling = 30, readonly experiment?: { id: string; limit: number }) {}
  scoped(id: string, limit: number) { return new Budget(this.root, this.ceiling, { id, limit }); }
  private async transaction<T>(action: (ledger: z.infer<typeof LedgerSchema>) => T) {
    await mkdir(this.root, { recursive: true }); const lock = path.join(this.root, '.budget-lock');
    let acquired = false;
    for (let n = 0; n < 100; n++) { try { await mkdir(lock); acquired = true; break; } catch { await pause(25); } }
    if (!acquired) throw new Error('BUDGET_LOCK: inspect stale lock before resuming');
    try {
      let ledger: z.infer<typeof LedgerSchema>;
      try { ledger = LedgerSchema.parse(JSON.parse(await readFile(path.join(this.root, 'budget.json'), 'utf8'))); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; ledger = { schemaVersion: 1, ceilingUsd: this.ceiling, experiments: {}, entries: {} }; }
      ledger.ceilingUsd = Math.min(ledger.ceilingUsd, this.ceiling);
      if (this.experiment) {
        const { id, limit } = this.experiment;
        ledger.experiments[id] = Math.min(ledger.experiments[id] ?? limit, limit);
        for (const [key, entry] of Object.entries(ledger.entries)) if (!entry.experimentId && (key.startsWith(`${id}-`) || key.startsWith(`github-${id}-`))) entry.experimentId = id;
      }
      const result = action(ledger); await atomic(path.join(this.root, 'budget.json'), json(ledger)); return result;
    } finally { await rm(lock, { recursive: true }); }
  }
  reserve(key: string, amount: number, reason: string) { return this.transaction(ledger => {
    if (!Number.isFinite(amount) || amount < 0) throw new Error('BUDGET_UNKNOWN: bounded price required');
    const existing = ledger.entries[key]; if (existing) { if (existing.reservedUsd !== amount) throw new Error('BUDGET: reservation changed'); return; }
    const used = Object.values(ledger.entries).reduce((sum, entry) => sum + (entry.chargedUpperBoundUsd ?? entry.reservedUsd), 0);
    if (used + amount > ledger.ceilingUsd + 1e-9) throw new Error('BUDGET_EXHAUSTED');
    if (this.experiment) {
      const usedInExperiment = Object.values(ledger.entries).filter(entry => entry.experimentId === this.experiment!.id).reduce((sum, entry) => sum + (entry.chargedUpperBoundUsd ?? entry.reservedUsd), 0);
      if (usedInExperiment + amount > ledger.experiments[this.experiment.id]! + 1e-9) throw new Error('EXPERIMENT_BUDGET_EXHAUSTED: models and CI share the same allowance');
    }
    ledger.entries[key] = { reservedUsd: amount, chargedUpperBoundUsd: null, reason, ...(this.experiment ? { experimentId: this.experiment.id } : {}) };
  }); }
  async settle(key: string, actualUpperBound: number) {
    const overrun = await this.transaction(ledger => {
      const entry = ledger.entries[key]; if (!entry || actualUpperBound < 0 || !Number.isFinite(actualUpperBound)) throw new Error('BUDGET: invalid reconciliation');
      entry.chargedUpperBoundUsd = actualUpperBound; return actualUpperBound > entry.reservedUsd;
    });
    if (overrun) throw new Error('BUDGET: actual exceeds reservation; known charge retained and further work must stop');
  }
  snapshot() { return this.transaction(ledger => structuredClone(ledger)); }
}
