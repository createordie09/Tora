import { app, session } from 'electron';
import * as path from 'path';
import { promises as fs } from 'fs';
import log from 'electron-log/main';

export interface InstalledExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  icon?: string;
  path: string;
  enabled: boolean;
  installedAt: number;
}

export class ExtensionManager {
  private extensions: InstalledExtension[] = [];
  private storagePath: string = '';
  private customSession: Electron.Session | null = null;

  public async init(targetSession?: Electron.Session): Promise<void> {
    if (targetSession) this.customSession = targetSession;
    const userData = app.getPath('userData');
    this.storagePath = path.join(userData, 'extensions.json');
    await this.loadManifestList();
  }

  private getSession(): Electron.Session {
    return this.customSession || session.defaultSession;
  }

  private async loadManifestList(): Promise<void> {
    try {
      const data = await fs.readFile(this.storagePath, 'utf8');
      this.extensions = JSON.parse(data);
    } catch {
      this.extensions = [];
    }
  }

  private async saveManifestList(): Promise<void> {
    try {
      await fs.writeFile(this.storagePath, JSON.stringify(this.extensions, null, 2), 'utf8');
    } catch (err) {
      log.warn('Failed to save extensions.json:', err);
    }
  }

  /**
   * Loads an unzipped Chrome extension (folder with manifest.json) into the browsing session.
   */
  public async installExtension(dirPath: string): Promise<{ ok: boolean; extension?: InstalledExtension; error?: string }> {
    try {
      const manifestPath = path.join(dirPath, 'manifest.json');
      const manifestRaw = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestRaw);

      if (!manifest.name || !manifest.version) {
        return { ok: false, error: 'Fichier manifest.json d\'extension Chrome invalide.' };
      }

      // Load into Electron session
      const ext = await this.getSession().loadExtension(dirPath, { allowFileAccess: true });

      const installed: InstalledExtension = {
        id: ext.id || Math.random().toString(36).substring(2, 11),
        name: manifest.name,
        version: manifest.version,
        description: manifest.description || 'Extension Chrome',
        path: dirPath,
        enabled: true,
        installedAt: Date.now(),
      };

      // Filter out duplicates and add new
      this.extensions = this.extensions.filter(e => e.id !== installed.id && e.path !== dirPath);
      this.extensions.push(installed);
      await this.saveManifestList();

      log.info(`Installed Chrome extension: ${installed.name} (${installed.id})`);
      return { ok: true, extension: installed };
    } catch (err: any) {
      log.error('Failed to install Chrome extension:', err);
      return { ok: false, error: err.message || 'Échec du chargement de l\'extension.' };
    }
  }

  /**
   * Loads all previously installed and enabled extensions on startup.
   */
  public async loadEnabledExtensions(): Promise<void> {
    for (const ext of this.extensions) {
      if (ext.enabled) {
        try {
          await this.getSession().loadExtension(ext.path, { allowFileAccess: true });
          log.info(`Loaded extension on startup: ${ext.name}`);
        } catch (err) {
          log.warn(`Could not load extension on startup: ${ext.name}`, err);
        }
      }
    }
  }

  public getExtensions(): InstalledExtension[] {
    return this.extensions;
  }

  public async toggleExtension(id: string, enabled: boolean): Promise<InstalledExtension[]> {
    const ext = this.extensions.find(e => e.id === id);
    if (ext) {
      ext.enabled = enabled;
      const s = this.getSession();
      if (!enabled && s.getExtension(id)) {
        s.removeExtension(id);
      } else if (enabled) {
        try {
          await s.loadExtension(ext.path, { allowFileAccess: true });
        } catch {}
      }
      await this.saveManifestList();
    }
    return this.extensions;
  }

  public async removeExtension(id: string): Promise<InstalledExtension[]> {
    const ext = this.extensions.find(e => e.id === id);
    if (ext) {
      const s = this.getSession();
      if (s.getExtension(id)) {
        s.removeExtension(id);
      }
      this.extensions = this.extensions.filter(e => e.id !== id);
      await this.saveManifestList();
    }
    return this.extensions;
  }
}

export const extensionManager = new ExtensionManager();
