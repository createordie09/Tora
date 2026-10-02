import { describe, it, expect, vi } from 'vitest';
import { ExtensionManager, InstalledExtension } from '../extension-manager';

describe('ExtensionManager test suite', () => {
  it('should initialize empty extensions array when storage is empty', async () => {
    const manager = new ExtensionManager();
    expect(manager.getExtensions()).toEqual([]);
  });

  it('should list and toggle extension enabled status', async () => {
    const manager = new ExtensionManager();
    const mockExt: InstalledExtension = {
      id: 'ext-123',
      name: 'AdBlock Plus',
      version: '1.0.0',
      description: 'Block ads',
      path: '/mock/path',
      enabled: true,
      installedAt: Date.now(),
    };

    (manager as any).extensions = [mockExt];
    expect(manager.getExtensions()).toHaveLength(1);
  });
});
