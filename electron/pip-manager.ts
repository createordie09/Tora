import { BrowserWindow } from 'electron';
import log from 'electron-log/main';

export class PipManager {
  private pipWindow: BrowserWindow | null = null;
  private activePipTabId: string | null = null;

  /**
   * Triggers Auto Picture-in-Picture floating window for a playing video tab.
   */
  public triggerAutoPip(tabId: string, videoUrl: string, parentWindow?: BrowserWindow | null): void {
    if (this.pipWindow && !this.pipWindow.isDestroyed()) return; // Already active

    try {
      this.activePipTabId = tabId;
      this.pipWindow = new BrowserWindow({
        width: 440,
        height: 260,
        alwaysOnTop: true,
        frame: true,
        title: 'Tora - Picture-in-Picture',
        resizable: true,
        skipTaskbar: false,
        parent: parentWindow || undefined,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      this.pipWindow.loadURL(videoUrl);
      this.pipWindow.on('closed', () => {
        this.pipWindow = null;
        this.activePipTabId = null;
      });

      log.info(`Auto PiP window launched for tab ${tabId}`);
    } catch (err) {
      log.warn('Failed to launch Auto PiP:', err);
    }
  }

  /**
   * Closes PiP window when returning to original video tab.
   */
  public closePipForTab(tabId: string): void {
    if (this.pipWindow && !this.pipWindow.isDestroyed() && this.activePipTabId === tabId) {
      this.pipWindow.close();
      this.pipWindow = null;
      this.activePipTabId = null;
    }
  }

  /**
   * Toggles PiP window for active tab.
   */
  public togglePip(tabId: string, videoUrl: string, parentWindow?: BrowserWindow | null): void {
    if (this.pipWindow && !this.pipWindow.isDestroyed()) {
      this.pipWindow.close();
      this.pipWindow = null;
      this.activePipTabId = null;
    } else {
      this.triggerAutoPip(tabId, videoUrl, parentWindow);
    }
  }
}

export const pipManager = new PipManager();
