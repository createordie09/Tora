// Pure helpers behind Tora's privacy features (kept free of Electron imports so they can be unit-tested).

const TRACKING_PARAM_NAMES = new Set([
  'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'twclid', 'ttclid',
  'li_fat_id', 'igshid', 'igsh', 'mc_eid', 'mc_cid', '_hsenc', '_hsmi', 'mkt_tok', 'vero_id',
  'srsltid', 'oly_anon_id', 'oly_enc_id', 'ref_src', 'ref_url', '_ga', '_gl', 'cmpid', 's_cid',
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAM_NAMES.has(lower);
}

/**
 * Removes well-known tracking parameters (utm_*, fbclid, gclid…) from a web URL while leaving
 * every other part of it byte-for-byte untouched. Returns the same URL when nothing was removed.
 */
export function cleanTrackingParams(rawUrl: string): { url: string; removed: number } {
  if (!/^https?:\/\//i.test(rawUrl)) return { url: rawUrl, removed: 0 };
  const hashIndex = rawUrl.indexOf('#');
  const beforeHash = hashIndex === -1 ? rawUrl : rawUrl.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : rawUrl.slice(hashIndex);
  const queryIndex = beforeHash.indexOf('?');
  if (queryIndex === -1) return { url: rawUrl, removed: 0 };

  const base = beforeHash.slice(0, queryIndex);
  const params = beforeHash.slice(queryIndex + 1).split('&');
  const kept = params.filter(part => {
    if (part === '') return false;
    const name = part.split('=')[0];
    let decoded = name;
    try { decoded = decodeURIComponent(name); } catch { /* keep raw name */ }
    return !isTrackingParam(decoded);
  });
  const removed = params.filter(p => p !== '').length - kept.length;
  if (removed === 0) return { url: rawUrl, removed: 0 };
  return { url: base + (kept.length ? `?${kept.join('&')}` : '') + hash, removed };
}

// Second-level public suffixes that need three labels to identify a site (example.co.uk).
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'ltd.uk', 'plc.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'org.nz', 'govt.nz',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp',
  'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn',
  'com.mx', 'com.ar', 'com.co', 'com.tr', 'com.sg', 'com.hk', 'com.tw', 'com.my', 'com.ph', 'com.vn', 'com.ng', 'com.eg',
  'co.za', 'co.kr', 'co.id', 'co.il', 'co.ke', 'co.th',
]);

/** Approximate "registrable domain" (site) of a hostname — enough to tell first from third party. */
export function getSiteKey(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || !host.includes('.')) return host;
  const labels = host.split('.');
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo) && labels.length >= 3) return labels.slice(-3).join('.');
  return lastTwo;
}

export function isThirdPartyRequest(requestUrl: string, topLevelUrl: string): boolean {
  try {
    const request = new URL(requestUrl);
    const top = new URL(topLevelUrl);
    if (!/^https?:$/.test(request.protocol) || !/^https?:$/.test(top.protocol)) return false;
    return getSiteKey(request.hostname) !== getSiteKey(top.hostname);
  } catch {
    return false;
  }
}

/** Reduces a Referer header to its origin ("https://site.example/") for cross-site requests. */
export function trimReferrer(referer: string): string {
  try {
    const u = new URL(referer);
    return `${u.origin}/`;
  } catch {
    return referer;
  }
}

/** Parses a hosts-file style list ("127.0.0.1 bad.example") into lowercase host names. */
export function parseHostsFile(text: string): string[] {
  const hosts: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const host = (parts.length > 1 ? parts[1] : parts[0]).toLowerCase();
    if (host && host !== 'localhost' && /^[a-z0-9.-]+$/.test(host) && host.includes('.')) hosts.push(host);
  }
  return hosts;
}

/** Parses a list of full URLs (one per line) into the host names they point to. */
export function parseUrlFeed(text: string): string[] {
  const hosts = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^https?:\/\//i.test(line)) continue;
    try {
      const host = new URL(line).hostname.toLowerCase();
      if (host.includes('.') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) hosts.add(host);
    } catch { /* ignore malformed line */ }
  }
  return Array.from(hosts);
}
