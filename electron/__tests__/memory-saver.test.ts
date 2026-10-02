import { describe, it, expect, vi } from 'vitest';
import { MemorySaverEngine, SuspendableTab } from '../memory-saver';

describe('MemorySaverEngine test suite', () => {
  it('should suspend inactive tabs older than threshold', () => {
    const engine = new MemorySaverEngine();
    const onSuspendMock = vi.fn();

    const oldTab: SuspendableTab = {
      id: 'tab-1',
      url: 'https://example.com',
      lastActiveAt: Date.now() - (15 * 60 * 1000), // 15 minutes ago
      view: {
        webContents: {
          isCurrentlyAudible: () => false,
          loadURL: vi.fn().mockResolvedValue(undefined),
          capturePage: vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,mock' }),
        },
      },
    };

    const activeTab: SuspendableTab = {
      id: 'tab-2',
      url: 'https://active.com',
      lastActiveAt: Date.now(),
      view: {
        webContents: {
          isCurrentlyAudible: () => false,
          loadURL: vi.fn().mockResolvedValue(undefined),
          capturePage: vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,mock' }),
        },
      },
    };

    engine.checkAndSuspendTabs([oldTab, activeTab], 'tab-2', onSuspendMock);

    expect(oldTab.isSuspended).toBe(true);
    expect(oldTab.suspendedUrl).toBe('https://example.com');
  });

  it('should skip audible tabs currently playing media', () => {
    const engine = new MemorySaverEngine();
    const onSuspendMock = vi.fn();

    const mediaTab: SuspendableTab = {
      id: 'media-tab',
      url: 'https://youtube.com/watch?v=123',
      lastActiveAt: Date.now() - (20 * 60 * 1000),
      view: {
        webContents: {
          isCurrentlyAudible: () => true, // Playing music/video
          loadURL: vi.fn().mockResolvedValue(undefined),
          capturePage: vi.fn().mockResolvedValue({ toDataURL: () => '' }),
        },
      },
    };

    engine.checkAndSuspendTabs([mediaTab], 'other-tab', onSuspendMock);
    expect(mediaTab.isSuspended).toBeUndefined();
  });
});
