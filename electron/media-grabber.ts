import fetch from 'cross-fetch';
import log from 'electron-log/main';

export interface DetectedMedia {
  id: string;
  title: string;
  url: string;
  type: 'video' | 'audio' | 'stream';
  quality?: string;
  format?: string;
}

export class MediaGrabber {
  private detectedMediaMap: Map<string, DetectedMedia[]> = new Map();

  /**
   * Sniffs network requests to detect audio/video streams across all web platforms.
   */
  public inspectRequest(tabId: string, url: string): void {
    const lower = url.toLowerCase();
    const isMedia = 
      lower.includes('.mp4') || 
      lower.includes('.mp3') || 
      lower.includes('.m3u8') || 
      lower.includes('.webm') ||
      lower.includes('.mpd') ||
      lower.includes('.m4s') ||
      lower.includes('googlevideo.com/videoplayback') ||
      lower.includes('vimeocdn.com') ||
      lower.includes('/video/');

    // Avoid fragment/chunk flooding on YouTube / HLS / DASH streams
    if (lower.includes('range=') || lower.includes('/segment') || lower.includes('fragment')) {
      return;
    }

    if (isMedia) {
      let type: 'video' | 'audio' | 'stream' = 'video';
      if (lower.includes('.mp3') || lower.includes('mime=audio')) type = 'audio';
      if (lower.includes('.m3u8') || lower.includes('.mpd')) type = 'stream';

      const media: DetectedMedia = {
        id: Math.random().toString(36).substring(2, 9),
        title: `Flux Média (${type.toUpperCase()})`,
        url,
        type,
      };

      const existing = this.detectedMediaMap.get(tabId) || [];
      if (!existing.some(m => m.url === url)) {
        if (existing.length >= 12) {
          existing.shift(); // Evict oldest media to cap memory
        }
        existing.push(media);
        this.detectedMediaMap.set(tabId, existing);
        log.info(`MediaGrabber detected media in tab ${tabId}: ${url}`);
      }
    }
  }

  public getMediaForTab(tabId: string): DetectedMedia[] {
    return this.detectedMediaMap.get(tabId) || [];
  }

  public clearTab(tabId: string): void {
    this.detectedMediaMap.delete(tabId);
  }
}

export const mediaGrabber = new MediaGrabber();
