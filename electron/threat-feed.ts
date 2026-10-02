import { promises as fs } from 'fs';
import fetch from 'cross-fetch';
import { parseHostsFile, parseUrlFeed } from './privacy-utils';

// Public, free lists of hosts currently serving malware or phishing. They are downloaded by Tora
// itself and kept on disk: checking a page never sends the address you visit to anyone.
const FEEDS: { name: string; url: string; parse: (text: string) => string[] }[] = [
  { name: 'URLhaus (malware)', url: 'https://urlhaus.abuse.ch/downloads/hostfile/', parse: parseHostsFile },
  { name: 'OpenPhish (phishing)', url: 'https://openphish.com/feed.txt', parse: parseUrlFeed },
];

const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal as any });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export class ThreatFeed {
  private hosts = new Set<string>();
  private fetchedAt = 0;

  constructor(private cacheFile: string, private logger: { info: (...a: any[]) => void; warn: (...a: any[]) => void } = console) {}

  get size(): number {
    return this.hosts.size;
  }

  has(hostname: string): boolean {
    return this.hosts.has(hostname.toLowerCase().replace(/\.$/, ''));
  }

  async load(): Promise<void> {
    try {
      const data = JSON.parse(await fs.readFile(this.cacheFile, 'utf8'));
      if (Array.isArray(data.hosts)) {
        this.hosts = new Set<string>(data.hosts);
        this.fetchedAt = Number(data.fetchedAt) || 0;
      }
    } catch {
      /* first run or unreadable cache: refreshed below */
    }
  }

  /** Downloads the lists when the cache is older than six hours. Safe to call repeatedly. */
  async refreshIfStale(): Promise<void> {
    if (Date.now() - this.fetchedAt < MAX_AGE_MS && this.hosts.size > 0) return;
    const merged = new Set<string>();
    let succeeded = 0;
    for (const feed of FEEDS) {
      try {
        feed.parse(await fetchText(feed.url)).forEach(h => merged.add(h));
        succeeded++;
      } catch (err) {
        this.logger.warn(`Threat feed "${feed.name}" could not be updated:`, err);
      }
    }
    if (succeeded === 0) return; // keep whatever we already have
    this.hosts = merged;
    this.fetchedAt = Date.now();
    this.logger.info(`Threat feed updated: ${merged.size} hosts`);
    try {
      await fs.writeFile(this.cacheFile, JSON.stringify({ fetchedAt: this.fetchedAt, hosts: Array.from(merged) }), 'utf8');
    } catch (err) {
      this.logger.warn('Threat feed cache not saved:', err);
    }
  }
}
