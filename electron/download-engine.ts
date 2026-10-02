import * as fs from 'fs';
import * as path from 'path';
import fetch from 'cross-fetch';
import { EventEmitter } from 'events';

export interface DownloadProgress {
  id: string;
  url: string;
  filename: string;
  receivedBytes: number;
  totalBytes: number;
  speedBytesPerSec: number;
  activeSegments: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
}

export interface ChunkRange {
  index: number;
  start: number;
  end: number;
  downloaded: number;
}

/**
 * Calculates byte range segments for parallel multi-threaded HTTP downloading.
 */
export function calculateChunkRanges(totalBytes: number, segmentCount: number): ChunkRange[] {
  if (totalBytes <= 0 || segmentCount <= 1) {
    return [{ index: 0, start: 0, end: Math.max(0, totalBytes - 1), downloaded: 0 }];
  }

  const chunkSize = Math.floor(totalBytes / segmentCount);
  const ranges: ChunkRange[] = [];

  for (let i = 0; i < segmentCount; i++) {
    const start = i * chunkSize;
    const end = i === segmentCount - 1 ? totalBytes - 1 : (i + 1) * chunkSize - 1;
    ranges.push({ index: i, start, end, downloaded: 0 });
  }

  return ranges;
}

export class MultiSegmentDownloader extends EventEmitter {
  public id: string;
  public url: string;
  public savePath: string;
  public segmentCount: number;
  public totalBytes: number = 0;
  public receivedBytes: number = 0;
  public state: 'progressing' | 'completed' | 'cancelled' | 'interrupted' = 'progressing';

  private startTime: number = Date.now();
  private isCancelled: boolean = false;

  constructor(id: string, url: string, savePath: string, segmentCount: number = 8) {
    super();
    this.id = id;
    this.url = url;
    this.savePath = savePath;
    this.segmentCount = segmentCount;
  }

  public async start(): Promise<boolean> {
    try {
      this.startTime = Date.now();

      // Check server capabilities (Content-Length and Accept-Ranges)
      const headRes = await fetch(this.url, { method: 'HEAD' });
      const contentLengthHeader = headRes.headers.get('content-length');
      const acceptRangesHeader = headRes.headers.get('accept-ranges');

      this.totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
      const supportsRanges = acceptRangesHeader === 'bytes' || (headRes.headers.get('content-range') !== null);

      // Pre-allocate file on disk
      await fs.promises.mkdir(path.dirname(this.savePath), { recursive: true });
      const fileHandle = await fs.promises.open(this.savePath, 'w');

      if (this.totalBytes > 1024 * 1024 && supportsRanges && this.segmentCount > 1) {
        // Multi-segment turbo download
        const ranges = calculateChunkRanges(this.totalBytes, this.segmentCount);
        await fileHandle.truncate(this.totalBytes);
        await fileHandle.close();

        await this.downloadSegmentsInParallel(ranges);
      } else {
        // Single stream fallback
        await fileHandle.close();
        await this.downloadSingleStream();
      }

      if (this.isCancelled) {
        this.state = 'cancelled';
        this.emit('progress', this.getProgress());
        return false;
      }

      this.state = 'completed';
      this.emit('progress', this.getProgress());
      return true;
    } catch (err) {
      this.state = 'interrupted';
      this.emit('error', err);
      this.emit('progress', this.getProgress());
      return false;
    }
  }

  public cancel(): void {
    this.isCancelled = true;
    this.state = 'cancelled';
  }

  private async downloadSegmentsInParallel(ranges: ChunkRange[]): Promise<void> {
    const downloadTasks = ranges.map(range => this.downloadRange(range));
    await Promise.all(downloadTasks);
  }

  private async downloadRange(range: ChunkRange): Promise<void> {
    if (this.isCancelled) return;

    const headers = { Range: `bytes=${range.start}-${range.end}` };
    const res = await fetch(this.url, { headers });

    if (!res.ok && res.status !== 206) {
      throw new Error(`HTTP range request failed with status ${res.status}`);
    }

    if (!res.body) {
      throw new Error('Response body is empty');
    }

    const fileHandle = await fs.promises.open(this.savePath, 'r+');
    let currentOffset = range.start;

    try {
      // Node.js stream / Web stream reader
      const reader = (res.body as any).getReader ? (res.body as any).getReader() : null;

      if (reader) {
        while (true) {
          if (this.isCancelled) {
            reader.cancel();
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;
          const buffer = Buffer.from(value);
          await fileHandle.write(buffer, 0, buffer.length, currentOffset);
          currentOffset += buffer.length;
          this.receivedBytes += buffer.length;
          this.emitThrottledProgress();
        }
      } else {
        // Standard Node stream
        const stream = res.body as any;
        for await (const chunk of stream) {
          if (this.isCancelled) break;
          const buffer = Buffer.from(chunk);
          await fileHandle.write(buffer, 0, buffer.length, currentOffset);
          currentOffset += buffer.length;
          this.receivedBytes += buffer.length;
          this.emitThrottledProgress();
        }
      }
    } finally {
      await fileHandle.close();
    }
  }

  private async downloadSingleStream(): Promise<void> {
    const res = await fetch(this.url);
    if (!res.ok) throw new Error(`HTTP download failed: ${res.status}`);

    const fileStream = fs.createWriteStream(this.savePath);
    const body = res.body as any;

    if (body.getReader) {
      const reader = body.getReader();
      while (true) {
        if (this.isCancelled) {
          reader.cancel();
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        const buffer = Buffer.from(value);
        if (!fileStream.write(buffer)) {
          await new Promise<void>(r => fileStream.once('drain', () => r()));
        }
        this.receivedBytes += buffer.length;
        this.emitThrottledProgress();
      }
    } else {
      for await (const chunk of body) {
        if (this.isCancelled) break;
        const buffer = Buffer.from(chunk);
        if (!fileStream.write(buffer)) {
          await new Promise<void>(r => fileStream.once('drain', () => r()));
        }
        this.receivedBytes += buffer.length;
        this.emitThrottledProgress();
      }
    }

    await new Promise<void>((resolve) => fileStream.end(() => resolve()));
  }

  private lastProgressEmit: number = 0;
  private emitThrottledProgress(): void {
    const now = Date.now();
    if (now - this.lastProgressEmit > 200) {
      this.lastProgressEmit = now;
      this.emit('progress', this.getProgress());
    }
  }

  private emitProgress(): void {
    this.emit('progress', this.getProgress());
  }

  public getProgress(): DownloadProgress {
    const elapsedSec = Math.max(0.1, (Date.now() - this.startTime) / 1000);
    const speedBytesPerSec = Math.round(this.receivedBytes / elapsedSec);

    return {
      id: this.id,
      url: this.url,
      filename: path.basename(this.savePath),
      receivedBytes: this.receivedBytes,
      totalBytes: this.totalBytes,
      speedBytesPerSec,
      activeSegments: this.segmentCount,
      state: this.state,
    };
  }
}
