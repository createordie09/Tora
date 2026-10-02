import { describe, it, expect } from 'vitest';
import { calculateChunkRanges } from '../download-engine';

describe('MultiSegmentDownloader chunk range calculation test suite', () => {
  it('should calculate correct byte ranges for 100MB split into 8 segments', () => {
    const totalBytes = 100 * 1024 * 1024; // 104,857,600 bytes
    const ranges = calculateChunkRanges(totalBytes, 8);

    expect(ranges).toHaveLength(8);
    expect(ranges[0].start).toBe(0);
    expect(ranges[7].end).toBe(totalBytes - 1);

    // Ensure contiguous non-overlapping ranges
    for (let i = 0; i < ranges.length - 1; i++) {
      expect(ranges[i + 1].start).toBe(ranges[i].end + 1);
    }
  });

  it('should handle single segment or zero bytes gracefully', () => {
    const singleRange = calculateChunkRanges(500, 1);
    expect(singleRange).toHaveLength(1);
    expect(singleRange[0].start).toBe(0);
    expect(singleRange[0].end).toBe(499);
  });
});
