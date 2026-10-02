export interface TabData {
  id: string;
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  favicon?: string;
  blockedCount: number;
  popupsBlockedCount: number;
  redirectsBlockedCount: number;
  scarewareBlockedCount: number;
  isSuspended?: boolean;
  isCrashed?: boolean;
  zoomLevel?: number;
  isBookmarked?: boolean;
  isReaderMode?: boolean;
  groupColor?: string;
  isAudible?: boolean;
  isMuted?: boolean;
  isPinned?: boolean;
  securityState?: 'secure' | 'insecure' | 'internal' | 'broken';
  certError?: { url: string; host: string; message: string };
  threatWarning?: { url: string; host: string };
  container?: { id: string; name: string; color: string };
  trackingParamsRemoved?: number;
  thirdPartyCookiesBlocked?: number;
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error' | 'disabled';
  version?: string;
  percent?: number;
  message?: string;
}

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  userDataPath: string;
  logPath: string;
  update: UpdateStatus;
}

export interface Container {
  id: string;
  name: string;
  color: string;
}

export interface Suggestion {
  kind: 'url' | 'search' | 'history' | 'bookmark';
  title: string;
  url: string;
}

export interface ClearDataOptions {
  range: 'hour' | 'day' | 'week' | 'all';
  history: boolean;
  cookies: boolean;
  cache: boolean;
  downloads: boolean;
  permissions: boolean;
}

export interface ToraSettings {
  isAdBlockEnabled: boolean;
  isAdultFilterEnabled: boolean;
  isPopupBlockerEnabled: boolean;
  isRedirectGuardEnabled: boolean;
  isScarewareShieldEnabled: boolean;
  isHttpsUpgradeEnabled: boolean;
  isPrivacyHeadersEnabled: boolean;
  isFingerprintProtectionEnabled: boolean;
  isCookieAutoRejectEnabled: boolean;
  isVerticalTabsEnabled: boolean;
  isMediaDownloadEnabled: boolean;
  isUrlCleanerEnabled: boolean;
  isThirdPartyCookieBlockEnabled: boolean;
  isReferrerTrimmingEnabled: boolean;
  isWebRtcProtectionEnabled: boolean;
  isSafeBrowsingEnabled: boolean;
  secureDns: 'off' | 'cloudflare' | 'quad9' | 'google';
  isAcceleratedDownloadEnabled: boolean;
  isVideoStreamTurboEnabled: boolean;
  searchEngine: string;
  startupMode: 'restore' | 'newtab' | 'homepage';
  homepageUrl: string;
  downloadDirectory: string;
  askDownloadLocation: boolean;
  isPrivateWindow?: boolean;
}

export interface Shortcut {
  id: string;
  title: string;
  url: string;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  timestamp: number;
}

export interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  receivedBytes: number;
  totalBytes: number;
  path: string;
  favicon?: string;
  speedBytesPerSec?: number;
  source?: 'browser' | 'video';
  paused?: boolean;
  canResume?: boolean;
  missing?: boolean;
  private?: boolean;
  startedAt?: number;
}

export interface CredentialEntry {
  id: string;
  domain: string;
  username: string;
  createdAt: number;
  lastUsedAt: number;
  favicon?: string;
}

export interface CredentialPrompt {
  pendingId: string;
  domain: string;
  username: string;
  kind: 'save' | 'update';
}

export interface BookmarkEntry {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  createdAt: number;
}

export interface LifetimeStats {
  adsBlocked: number;
  popupsBlocked: number;
  redirectsBlocked: number;
  scarewareBlocked: number;
  cookieBannersRejected: number;
  trackingParamsRemoved: number;
  thirdPartyCookiesBlocked: number;
  threatsBlocked: number;
}

export interface FocusModeState {
  manuallyEnabled: boolean;
  blockedSites: string[];
  schedule: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    days: number[];
  };
  isActiveNow?: boolean;
}

export interface PermissionPrompt {
  pendingId: string;
  tabId: string;
  domain: string;
  permission: string;
}

export interface ToraAPI {
  createTab: (url?: string) => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  navigate: (id: string, url: string) => void;
  goBack: (id: string) => void;
  goForward: (id: string) => void;
  reload: (id: string) => void;
  
  toggleAdBlock: () => void;
  toggleAdultFilter: (enabled: boolean) => void;
  updateSettings: (settings: Partial<ToraSettings>) => void;
  
  allowPopupOnce: (id: string) => void;
  forceNavigate: (id: string, url: string) => void;
  
  onTabUpdated: (callback: (tabs: TabData[], activeTabId: string, settings: ToraSettings) => void) => () => void;
  onProtectionEvent: (callback: (tabId: string, type: 'redirect' | 'loop' | 'popup', url?: string) => void) => () => void;
  onDownloadsUpdated: (callback: (downloads: DownloadItem[]) => void) => () => void;
  
  getShortcuts: () => Promise<Shortcut[]>;
  saveShortcut: (title: string, url: string) => Promise<Shortcut[]>;
  deleteShortcut: (id: string) => Promise<Shortcut[]>;
  
  getHistory: () => Promise<HistoryEntry[]>;
  clearHistory: () => Promise<void>;
  deleteHistoryEntry: (id: string) => Promise<void>;
  
  getDownloads: () => Promise<DownloadItem[]>;
  showItemInFolder: (path: string) => void;
  openItem: (path: string) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  retryDownload: (id: string) => void;
  removeDownload: (id: string) => void;
  clearDownloads: () => void;
  reopenClosedTab: () => void;
  createPrivateWindow: () => void;
  printPage: () => void;
  savePagePdf: () => void;
  savePageHtml: () => void;
  viewSource: () => void;
  getSuggestions: (query: string) => Promise<Suggestion[]>;
  requestTabState: () => void;
  getAppInfo: () => Promise<AppInfo>;
  openDataFolder: () => void;
  openLogFolder: () => void;
  checkForUpdates: () => void;
  installUpdate: () => void;
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
  getContainers: () => Promise<Container[]>;
  saveContainer: (container: { id?: string; name: string; color: string }) => Promise<Container[]>;
  deleteContainer: (id: string) => Promise<Container[]>;
  createContainerTab: (id: string, url?: string) => void;
  certProceed: (tabId: string) => void;
  threatProceed: (tabId: string) => void;
  threatGoBack: (tabId: string) => void;
  certGoBack: (tabId: string) => void;
  clearBrowsingData: (options: ClearDataOptions) => Promise<{ ok: boolean; cleared: string[] }>;
  chooseDownloadDirectory: () => Promise<string | null>;
  onShortcutAction: (callback: (action: string) => void) => () => void;
  onStorageError: (callback: (file: string) => void) => () => void;
  
  createNewWindow: () => void;
  quitApp: () => void;
  openDevTools: () => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  setOverlayActive: (reason: string, active: boolean) => void;
  onWindowMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;

  // Password manager
  getCredentials: () => Promise<CredentialEntry[]>;
  deleteCredential: (id: string) => Promise<CredentialEntry[]>;
  revealCredentialPassword: (id: string) => Promise<string>;
  updateCredential: (id: string, changes: { username?: string; password?: string }) => Promise<{ ok: boolean; error?: string; credentials?: CredentialEntry[] }>;
  getPasswordHealth: () => Promise<Record<string, { weak: boolean; reused: boolean }>>;
  checkPasswordBreach: (id: string) => Promise<{ ok: boolean; count?: number; error?: string }>;
  copyCredentialUsername: (username: string) => void;
  copyCredentialPassword: (id: string) => void;
  confirmSaveCredential: (pendingId: string) => void;
  dismissCredentialPrompt: (pendingId: string) => void;
  neverSaveForDomain: (pendingId: string) => void;
  onCredentialPrompt: (callback: (prompt: CredentialPrompt) => void) => () => void;

  // Bookmarks
  getBookmarks: () => Promise<BookmarkEntry[]>;
  toggleBookmark: (id: string) => Promise<BookmarkEntry[]>;
  deleteBookmark: (id: string) => Promise<BookmarkEntry[]>;

  // Zoom
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;

  // Find in page
  findInPage: (query: string) => void;
  findInPageNext: (query: string, forward: boolean) => void;
  stopFindInPage: () => void;
  onFindInPageResult: (callback: (result: { matches: number; activeMatchOrdinal: number }) => void) => () => void;

  // Keyboard-shortcut-triggered UI events
  onFocusAddressBar: (callback: () => void) => () => void;
  onShowFindBar: (callback: () => void) => () => void;

  // Encrypted vault backup — independent of the OS credential store
  exportCredentials: (masterPassword: string) => Promise<{ ok: boolean; error?: string; count?: number }>;
  importCredentials: (masterPassword: string) => Promise<{ ok: boolean; error?: string; added?: number; updated?: number }>;

  getLifetimeStats: () => Promise<LifetimeStats>;
  toggleReaderMode: () => void;
  stopLoad: (id: string) => void;
  reorderTabs: (newOrderIds: string[]) => void;
  setTabGroupColor: (id: string, color: string | null) => void;

  getFocusMode: () => Promise<FocusModeState>;
  updateFocusMode: (partial: Partial<FocusModeState>) => Promise<FocusModeState>;
  addFocusBlockedSite: (site: string) => Promise<string[]>;
  removeFocusBlockedSite: (site: string) => Promise<string[]>;

  importChromeBookmarks: () => Promise<{ ok: boolean; error?: string; imported?: number; skipped?: number }>;
  importChromePasswords: () => Promise<{ ok: boolean; error?: string; imported?: number; updated?: number }>;
  toggleTabMute: (id: string) => void;
  duplicateTab: (id: string) => void;
  pinTab: (id: string, pinned: boolean) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToRight: (id: string) => void;
}

declare global {
  interface Window {
    tora: ToraAPI;
  }
}
