import fetch from 'cross-fetch';
import log from 'electron-log/main';

interface CachedSegment {
  url: string;
  data: Buffer;
  contentType: string;
  timestamp: number;
}

export class VideoStreamAccelerator {
  private cache: Map<string, CachedSegment> = new Map();
  private maxCacheSize: number = 50; // Keep last 50 video chunks in RAM (~50-100MB)
  private isPrefetching: boolean = false;

  /**
   * Examines request URL for HLS (.m3u8) / DASH (.mpd) manifests or media chunks (.ts, .m4s).
   */
  public handleUrl(url: string, enabled: boolean): void {
    if (!enabled) return;

    const lower = url.toLowerCase();
    if (lower.includes('.m3u8')) {
      this.prefetchHLSManifest(url);
    }
  }

  /**
   * Fetches HLS manifest and pre-caches the next 5 video segments in advance.
   */
  private async prefetchHLSManifest(manifestUrl: string): Promise<void> {
    if (this.isPrefetching) return;
    this.isPrefetching = true;

    try {
      const res = await fetch(manifestUrl);
      if (!res.ok) return;
      const text = await res.text();

      const lines = text.split('\n');
      const segmentUrls: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          try {
            const absoluteUrl = new URL(trimmed, manifestUrl).href;
            segmentUrls.push(absoluteUrl);
          } catch {}
        }
      }

      // Prefetch the first 5 segments in parallel
      const nextSegments = segmentUrls.slice(0, 5);
      await Promise.all(nextSegments.map(url => this.prefetchSegment(url)));
    } catch (err) {
      log.warn('Video prefetch failed:', err);
    } finally {
      this.isPrefetching = false;
    }
  }

  /**
   * Prefetches a single video chunk into RAM cache.
   */
  public async prefetchSegment(segmentUrl: string): Promise<void> {
    if (this.cache.has(segmentUrl)) return;

    try {
      const res = await fetch(segmentUrl);
      if (!res.ok) return;
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = res.headers.get('content-type') || 'video/MP2T';

      this.cacheSegment(segmentUrl, buffer, contentType);
      log.info(`Prefetched video chunk: ${segmentUrl} (${buffer.length} bytes)`);
    } catch {}
  }

  private cacheSegment(url: string, data: Buffer, contentType: string): void {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(url, {
      url,
      data,
      contentType,
      timestamp: Date.now(),
    });
  }

  public getCachedSegment(url: string): CachedSegment | undefined {
    return this.cache.get(url);
  }
}

export const videoAccelerator = new VideoStreamAccelerator();
