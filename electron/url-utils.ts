import * as path from 'path';

/**
 * Extracts domain name from a raw URL string safely.
 */
export function getRegistrableDomain(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Checks if a URL is an internal Tora scheme (e.g. tora://settings).
 */
export function isInternalUrl(url: string): boolean {
  return url.startsWith('tora://');
}

/**
 * Checks if URL is empty or an internal Tora scheme.
 */
export function isInternalOrEmpty(url: string): boolean {
  return url === '' || isInternalUrl(url);
}

export const SEARCH_ENGINES: Record<string, string> = {
  duckduckgo: 'https://duckduckgo.com/?q=',
  google: 'https://www.google.com/search?q=',
  brave: 'https://search.brave.com/search?q=',
  qwant: 'https://www.qwant.com/?q=',
  ecosia: 'https://www.ecosia.org/search?q=',
};
export const DEFAULT_SEARCH_ENGINE = 'duckduckgo';

export const SEARCH_ENGINE_LABELS: Record<string, string> = {
  duckduckgo: 'DuckDuckGo',
  google: 'Google',
  brave: 'Brave Search',
  qwant: 'Qwant',
  ecosia: 'Ecosia',
};

/**
 * True for hosts that must never be force-upgraded to HTTPS and that are served on the
 * local machine / local network: localhost, *.localhost, *.local, loopback, RFC1918, link-local.
 */
export function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host.includes(':')) {
    return host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd');
  }
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

const HOST_LIKE = /^(localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:]+\]|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d{1,5})?(?:[/?#]\S*)?$/i;

export function buildSearchUrl(query: string, searchEngine: string = DEFAULT_SEARCH_ENGINE): string {
  const base = SEARCH_ENGINES[searchEngine] ?? SEARCH_ENGINES[DEFAULT_SEARCH_ENGINE];
  return base + encodeURIComponent(query);
}

/**
 * Validates and formats text typed in the address bar.
 * - tora:// pages and "about:blank" are internal
 * - javascript:, vbscript:, data:, file: and other non-web schemes are refused
 * - localhost / private IPs use http://, everything else that looks like a host uses https://
 * - anything else becomes a search on the chosen engine
 */
export function sanitizeNavigationUrl(input: string, searchEngine: string = DEFAULT_SEARCH_ENGINE): { valid: boolean; url: string } {
  const trimmed = input.trim();
  if (!trimmed || trimmed.toLowerCase() === 'about:blank') {
    return { valid: true, url: '' };
  }

  if (isInternalUrl(trimmed)) {
    return { valid: true, url: trimmed.toLowerCase().replace(/\/+$/, '') };
  }

  if (/^(javascript|vbscript|data|file|blob|chrome|view-source):/i.test(trimmed)) {
    return { valid: false, url: 'about:blank' };
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (['http:', 'https:', 'ftp:'].includes(parsed.protocol)) {
        return { valid: true, url: parsed.href };
      }
    } catch {
      // fall through to refusal
    }
    return { valid: false, url: 'about:blank' };
  }

  if (!/\s/.test(trimmed) && HOST_LIKE.test(trimmed)) {
    try {
      const hostname = new URL(`http://${trimmed}`).hostname;
      const scheme = isLocalOrPrivateHost(hostname) ? 'http' : 'https';
      return { valid: true, url: `${scheme}://${trimmed}` };
    } catch {
      // not a parseable host after all: treat as a search
    }
  }

  return { valid: true, url: buildSearchUrl(trimmed, searchEngine) };
}

/**
 * Verifies that a target file path resides within a specified base directory
 * (the base itself does not count). Prevents directory traversal and sibling-prefix
 * tricks such as "/downloads-evil" matching "/downloads".
 */
export function isSafeFilePath(baseDir: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** http(s) only, and never a private/loopback address (SSRF guard for page-initiated downloads). */
export function isSafeRemoteDownloadUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !isLocalOrPrivateHost(u.hostname);
  } catch {
    return false;
  }
}
