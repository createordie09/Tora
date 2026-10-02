import * as crypto from 'crypto';

const COMMON_PASSWORDS = new Set([
  '123456', '12345678', '123456789', '1234567890', 'password', 'password1', 'password123', 'qwerty', 'qwerty123',
  'azerty', 'azerty123', 'abc123', '111111', '000000', 'iloveyou', 'admin', 'admin123', 'welcome', 'letmein',
  'monkey', 'dragon', 'football', 'motdepasse', 'soleil', 'doudou', '1q2w3e4r', 'azertyuiop', 'qwertyuiop',
]);

export function sha1Hex(value: string): string {
  return crypto.createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase();
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

/** A password is weak when it is short, very common, a single repeated character, or uses one kind of character. */
export function isWeakPassword(password: string): boolean {
  if (password.length < 10) return true;
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return true;
  if (/^(.)\1+$/.test(password)) return true;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(re => re.test(password)).length;
  return kinds < 2 && password.length < 16;
}

/**
 * k-anonymity split for the "Have I Been Pwned" range API: only the 5-character prefix of the
 * SHA-1 hash is ever sent; the suffix is compared locally.
 */
export function splitPwnedHash(password: string): { prefix: string; suffix: string } {
  const hash = sha1Hex(password);
  return { prefix: hash.slice(0, 5), suffix: hash.slice(5) };
}

/** Reads a range-API response ("SUFFIX:COUNT" lines, padded entries have count 0). */
export function countInPwnedRange(responseText: string, suffix: string): number {
  for (const line of responseText.split(/\r?\n/)) {
    const [candidate, count] = line.trim().split(':');
    if (candidate && candidate.toUpperCase() === suffix.toUpperCase()) return Number(count) || 0;
  }
  return 0;
}
