import { promises as fs } from 'fs';
import * as path from 'path';

interface Logger {
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
}

export interface JsonStoreOptions {
  /** Folder holding the data files (evaluated on every call). */
  getDir: () => string;
  log: Logger;
  /** Called (at most once a minute) when a file could not be written. */
  onSaveError?: (file: string) => void;
  /** Minimum delay between two rolling backups of the same file. */
  backupIntervalMs?: number;
}

/**
 * Small JSON file store used for every piece of user data (favorites, history, settings…).
 *  - writes are atomic (temporary file + rename) and queued per file, so overlapping saves never clash
 *  - the previous good version is kept as <name>.bak (at most every `backupIntervalMs`)
 *  - an unreadable file is never silently discarded: it is set aside as <name>.corrupt-<time>
 *    and the backup is tried before falling back to the default value
 */
export class JsonStore {
  private queues = new Map<string, Promise<void>>();
  private lastBackupAt = new Map<string, number>();
  private lastErrorNotified = 0;

  constructor(private options: JsonStoreOptions) {}

  async read<T>(file: string, fallback: T): Promise<T> {
    const target = path.join(this.options.getDir(), file);
    const tryParse = async (filePath: string): Promise<T> => JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
    try {
      return await tryParse(target);
    } catch (err: any) {
      if (err?.code === 'ENOENT') return fallback;
      this.options.log.error(`Data file "${file}" could not be read:`, err);
      try { await fs.rename(target, `${target}.corrupt-${Date.now()}`); } catch { /* already gone */ }
      try {
        const restored = await tryParse(target + '.bak');
        this.options.log.warn(`Data file "${file}" restored from its backup.`);
        return restored;
      } catch {
        return fallback;
      }
    }
  }

  save(file: string, data: unknown): Promise<void> {
    const snapshot = JSON.stringify(data, null, 2); // taken now, so later mutations cannot leak into this write
    const previous = this.queues.get(file) ?? Promise.resolve();
    const next = previous.then(() => this.write(file, snapshot));
    this.queues.set(file, next);
    return next;
  }

  private async write(file: string, serialized: string): Promise<void> {
    const target = path.join(this.options.getDir(), file);
    const tmp = target + '.tmp';
    const interval = this.options.backupIntervalMs ?? 10 * 60 * 1000;
    try {
      await fs.writeFile(tmp, serialized, 'utf8');
      if (Date.now() - (this.lastBackupAt.get(file) ?? 0) > interval) {
        try {
          await fs.copyFile(target, target + '.bak');
          this.lastBackupAt.set(file, Date.now());
        } catch { /* nothing to back up yet */ }
      }
      await fs.rename(tmp, target);
    } catch (err) {
      this.options.log.error(`Saving "${file}" failed:`, err);
      if (Date.now() - this.lastErrorNotified > 60_000) {
        this.lastErrorNotified = Date.now();
        this.options.onSaveError?.(file);
      }
    }
  }
}
