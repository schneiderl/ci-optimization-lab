import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Plan, type Workload } from '../../contracts/index.js';
import { within } from '../../util.js';

/** The model receives these values, never a filesystem or shell capability. */
export class ScopedFiles {
  constructor(private readonly checkout: string, private readonly manifest: Workload) {}
  private async resolve(file: string, write: boolean) {
    if (path.isAbsolute(file) || file.split('/').some(part => part === '..' || part === '.git') || file.includes('\\')) throw new Error('SCOPE: invalid path');
    if (write && !this.manifest.allowedFiles.includes(file as 'ci/plan.json')) throw new Error('SCOPE: protected file');
    if (!write && !(file in this.manifest.protectedFiles) && file !== 'ci/plan.json') throw new Error('SCOPE: file is not in the snapshot');
    const root = await realpath(this.checkout), target = path.join(root, file);
    let current = root;
    for (const component of file.split('/')) { current = path.join(current, component); if ((await lstat(current)).isSymbolicLink()) throw new Error('SCOPE: symlink denied'); }
    if (!within(root, await realpath(target))) throw new Error('SCOPE: escape denied');
    return target;
  }
  async read(file: string) { return readFile(await this.resolve(file, false), 'utf8'); }
  async write(file: string, content: string) {
    const target = await this.resolve(file, true);
    Plan.parse(JSON.parse(content));
    if ((await lstat(target)).nlink !== 1) throw new Error('SCOPE: hard link denied');
    await writeFile(target, content, { mode: 0o644 });
  }
  async snapshot() {
    const files: Record<string, string> = {};
    for (const file of ['ci/plan.json', '.github/workflows/experiment.yml', 'ci/case.json']) files[file] = await this.read(file);
    return files;
  }
}
