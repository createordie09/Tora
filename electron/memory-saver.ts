import log from 'electron-log/main';

export interface SuspendableTab {
  id: string;
  url: string;
  lastActiveAt: number;
  isSuspended?: boolean;
  suspendedUrl?: string;
  view: {
    webContents: {
      isCurrentlyAudible: () => boolean;
      loadURL: (url: string) => Promise<any>;
      capturePage: () => Promise<any>;
    };
  };
}

export class MemorySaverEngine {
  private inactivityThresholdMs: number = 10 * 60 * 1000; // 10 minutes

  /**
   * Checks tabs and suspends eligible inactive tabs.
   */
  public checkAndSuspendTabs(tabs: SuspendableTab[], activeTabId: string | null, onSuspend: (tab: SuspendableTab, snapshotUrl: string | null) => void): void {
    const now = Date.now();

    for (const tab of tabs) {
      if (tab.id === activeTabId) continue; // Don't suspend current active tab
      if (tab.isSuspended) continue; // Already suspended
      if (tab.url === '' || tab.url.startsWith('tora://') || tab.url === 'about:blank') continue;

      // Skip tabs playing audio/video
      try {
        if (tab.view.webContents.isCurrentlyAudible()) continue;
      } catch {}

      const inactiveDuration = now - tab.lastActiveAt;
      if (inactiveDuration >= this.inactivityThresholdMs) {
        this.suspendTab(tab, onSuspend);
      }
    }
  }

  private async suspendTab(tab: SuspendableTab, onSuspend: (tab: SuspendableTab, snapshotUrl: string | null) => void): Promise<void> {
    try {
      log.info(`Hibernating inactive tab ${tab.id} (${tab.url}) to free RAM`);
      tab.suspendedUrl = tab.url;
      tab.isSuspended = true;

      let snapshotDataUrl: string | null = null;
      try {
        const image = await tab.view.webContents.capturePage();
        snapshotDataUrl = image.toDataURL();
      } catch {}

      await tab.view.webContents.loadURL('about:blank');
      onSuspend(tab, snapshotDataUrl);
    } catch (err) {
      log.warn(`Failed to suspend tab ${tab.id}:`, err);
    }
  }
}

export const memorySaverEngine = new MemorySaverEngine();
