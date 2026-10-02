import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import log from 'electron-log/main';

const execFileAsync = promisify(execFile);

export interface ImportedBookmark {
  url: string;
  title: string;
}

export interface ImportedCredential {
  domain: string;
  username: string;
  password: string;
}

// Chrome (and Chromium-based browsers generally) keep each user profile in its own folder
// under a shared "User Data" directory. We check the common ones on Windows; this feature
// is Windows-only for now since that's covered by DPAPI below (macOS/Linux use a different
// encryption scheme entirely for the password store).
function getChromeUserDataPath(): string | null {
  if (process.platform !== 'win32') return null;
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;
  return path.join(localAppData, 'Google', 'Chrome', 'User Data');
}

async function findChromeProfiles(): Promise<string[]> {
  const userDataPath = getChromeUserDataPath();
  if (!userDataPath) return [];
  try {
    const entries = await fs.readdir(userDataPath, { withFileTypes: true });
    const profiles = entries
      .filter(e => e.isDirectory() && (e.name === 'Default' || e.name.startsWith('Profile ')))
      .map(e => path.join(userDataPath, e.name));
    return profiles;
  } catch (err) {
    log.warn('Chrome import: could not list profiles', err);
    return [];
  }
}

// ===== Bookmarks =====

function extractBookmarkNodes(node: any, out: ImportedBookmark[]) {
  if (!node) return;
  if (node.type === 'url' && node.url) {
    out.push({ url: node.url, title: node.name || node.url });
  } else if (node.type === 'folder' && Array.isArray(node.children)) {
    for (const child of node.children) extractBookmarkNodes(child, out);
  }
}

export async function importChromeBookmarks(): Promise<{ ok: boolean; error?: string; bookmarks?: ImportedBookmark[] }> {
  const profiles = await findChromeProfiles();
  if (profiles.length === 0) {
    return { ok: false, error: "Aucun profil Chrome trouvé sur cette machine." };
  }

  const collected: ImportedBookmark[] = [];
  for (const profileDir of profiles) {
    try {
      const raw = await fs.readFile(path.join(profileDir, 'Bookmarks'), 'utf8');
      const data = JSON.parse(raw);
      const roots = data.roots || {};
      for (const key of Object.keys(roots)) {
        extractBookmarkNodes(roots[key], collected);
      }
    } catch (err) {
      // A profile without a Bookmarks file yet (never used) is normal — skip it.
    }
  }

  if (collected.length === 0) {
    return { ok: false, error: "Aucun favori trouvé dans les profils Chrome détectés." };
  }
  return { ok: true, bookmarks: collected };
}

// ===== Passwords =====
// Chrome's password store on Windows: an SQLite database ("Login Data") with each
// password encrypted via AES-256-GCM, using a key that is itself protected by Windows
// DPAPI (tied to the Windows user account) and stored in "Local State". This mirrors
// exactly what Chrome itself does internally to read its own password store — the same
// technique legitimate password-migration tools use. Nothing here touches any other
// user's data or leaves the machine.

async function getChromeDpapiKey(userDataPath: string): Promise<Buffer | null> {
  let localStateRaw: string;
  try {
    localStateRaw = await fs.readFile(path.join(userDataPath, 'Local State'), 'utf8');
  } catch (err) {
    log.warn('Chrome import: could not read Local State', err);
    return null;
  }

  let encryptedKeyB64: string;
  try {
    const localState = JSON.parse(localStateRaw);
    encryptedKeyB64 = localState.os_crypt?.encrypted_key;
    if (!encryptedKeyB64) return null;
  } catch (err) {
    return null;
  }

  const encryptedKeyBytes = Buffer.from(encryptedKeyB64, 'base64');
  // Chrome prefixes the DPAPI-protected key with the literal ASCII bytes "DPAPI".
  const DPAPI_PREFIX = Buffer.from('DPAPI', 'ascii');
  if (!encryptedKeyBytes.subarray(0, 5).equals(DPAPI_PREFIX)) {
    log.warn('Chrome import: unexpected encrypted_key format (no DPAPI prefix)');
    return null;
  }
  const dpapiBlob = encryptedKeyBytes.subarray(5);

  // Node has no built-in DPAPI binding, so we shell out to PowerShell's
  // System.Security.Cryptography.ProtectedData — a standard, documented Windows API,
  // scoped to CurrentUser (the same account that encrypted it in the first place; this
  // cannot decrypt another user's data).
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tora-import-'));
  const inPath = path.join(tmpDir, 'in.bin');
  const outPath = path.join(tmpDir, 'out.bin');
  try {
    await fs.writeFile(inPath, dpapiBlob);
    const script = `
      Add-Type -AssemblyName System.Security
      $bytes = [System.IO.File]::ReadAllBytes('${inPath}')
      $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
      [System.IO.File]::WriteAllBytes('${outPath}', $decrypted)
    `;
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    const keyBytes = await fs.readFile(outPath);
    return keyBytes;
  } catch (err) {
    log.error('Chrome import: DPAPI unprotect failed', err);
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function decryptChromePassword(encrypted: Buffer, key: Buffer): string | null {
  try {
    const prefix = encrypted.subarray(0, 3).toString('ascii');
    if (prefix === 'v10' || prefix === 'v11') {
      const nonce = encrypted.subarray(3, 15);
      const ciphertext = encrypted.subarray(15, encrypted.length - 16);
      const authTag = encrypted.subarray(encrypted.length - 16);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    }
    return null; // older pre-v10 format (direct DPAPI per-entry) — not handled here
  } catch (err) {
    return null;
  }
}

export async function importChromePasswords(): Promise<{ ok: boolean; error?: string; credentials?: ImportedCredential[] }> {
  const userDataPath = getChromeUserDataPath();
  if (!userDataPath) {
    return { ok: false, error: "Import des mots de passe disponible uniquement sur Windows pour le moment." };
  }

  const key = await getChromeDpapiKey(userDataPath);
  if (!key) {
    return { ok: false, error: "Impossible de déchiffrer la clé de Chrome. Vérifiez que Chrome est bien installé et a été ouvert au moins une fois." };
  }

  const profiles = await findChromeProfiles();
  if (profiles.length === 0) {
    return { ok: false, error: "Aucun profil Chrome trouvé." };
  }

  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();

  const collected: ImportedCredential[] = [];
  let anyProfileReadOk = false;

  for (const profileDir of profiles) {
    const loginDataPath = path.join(profileDir, 'Login Data');
    let tmpCopyPath: string | null = null;
    try {
      // Chrome locks this file while running — read from a copy instead of the live file.
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tora-import-db-'));
      tmpCopyPath = path.join(tmpDir, 'Login Data');
      await fs.copyFile(loginDataPath, tmpCopyPath);

      const fileBuffer = await fs.readFile(tmpCopyPath);
      const db = new SQL.Database(fileBuffer);
      const results = db.exec('SELECT origin_url, username_value, password_value FROM logins');
      db.close();

      if (results.length > 0) {
        anyProfileReadOk = true;
        for (const row of results[0].values) {
          const [originUrl, username, passwordBlob] = row as [string, string, Uint8Array];
          if (!username || !passwordBlob) continue;
          const decrypted = decryptChromePassword(Buffer.from(passwordBlob), key);
          if (!decrypted) continue;
          try {
            const domain = new URL(originUrl).hostname.replace(/^www\./, '');
            collected.push({ domain, username, password: decrypted });
          } catch (err) {}
        }
      }
    } catch (err) {
      log.warn(`Chrome import: could not read profile ${profileDir}`, err);
    } finally {
      if (tmpCopyPath) await fs.rm(path.dirname(tmpCopyPath), { recursive: true, force: true }).catch(() => {});
    }
  }

  if (!anyProfileReadOk) {
    return { ok: false, error: "Impossible de lire la base de mots de passe de Chrome (fermez Chrome et réessayez)." };
  }
  return { ok: true, credentials: collected };
}
