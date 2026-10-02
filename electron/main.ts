import { app, BrowserWindow, WebContentsView, ipcMain, session, shell, safeStorage, clipboard, Menu, dialog, screen } from 'electron';
import * as path from 'path';
import { pathToFileURL } from 'url';
import * as crypto from 'crypto';
import log from 'electron-log/main';import { ElectronBlocker } from '@ghostery/adblocker-electron';
import fetch from 'cross-fetch';
import { promises as fs, existsSync, writeFileSync, renameSync } from 'fs';
import { TabData, ToraSettings, Shortcut, HistoryEntry, DownloadItem, CredentialEntry, BookmarkEntry, Suggestion, ClearDataOptions } from './types';
import { importChromeBookmarks, importChromePasswords } from './chrome-import';
import { videoAccelerator } from './video-accelerator';
import { memorySaverEngine } from './memory-saver';
import { pipManager } from './pip-manager';
import { extensionManager } from './extension-manager';
import { MultiSegmentDownloader, DownloadProgress } from './download-engine';
import { mediaGrabber } from './media-grabber';
import { generateFakePersona } from './fake-persona';
import { cleanTrackingParams, isThirdPartyRequest, trimReferrer, getSiteKey } from './privacy-utils';
import { ThreatFeed } from './threat-feed';
import { JsonStore } from './storage';
import { ERROR_MESSAGES, certErrorMessage, buildErrorPage } from './error-pages';
import { sha256Hex, isWeakPassword, splitPwnedHash, countInPwnedRange } from './password-tools';
import {
  getRegistrableDomain,
  isInternalUrl,
  isInternalOrEmpty,
  sanitizeNavigationUrl,
  buildSearchUrl,
  SEARCH_ENGINES,
  SEARCH_ENGINE_LABELS,
  isLocalOrPrivateHost,
  isSafeRemoteDownloadUrl,
  isSafeFilePath,
  escapeHtml,
} from './url-utils';

// ===== Application identity and data folder =====
// Must run before anything reads app.getPath('userData').
app.setName('Tora');
{
  const appData = app.getPath('appData');
  const legacyDir = path.join(appData, 'react-example'); // folder used before Tora had its own name
  const dataDir = path.join(appData, 'Tora');
  if (process.env.TORA_USER_DATA) {
    // Tests and portable setups can point Tora at a throw-away data folder.
    app.setPath('userData', process.env.TORA_USER_DATA);
  } else {
    if (!existsSync(dataDir) && existsSync(legacyDir)) {
      try {
        renameSync(legacyDir, dataDir); // one-time move: favorites, passwords and cookies come along
      } catch (err) {
        console.warn('Could not move the previous data folder, keeping it in place:', err);
      }
    }
    app.setPath('userData', existsSync(dataDir) ? dataDir : legacyDir);
  }
}

// ===== Structured logging =====
// Writes to a rotating file in userData (Windows: %APPDATA%/tora/logs/main.log) so issues
// can be diagnosed from the log file itself instead of screenshots of the terminal.
log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB, auto-rotates old logs
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception in main process:', err);
});
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled promise rejection in main process:', reason);
});


// ===== IPC hardening =====
// Every channel is tied to the kind of sender that is allowed to use it:
//  - "page" channels come from a tab's content preload (view-preload.ts)
//  - every other channel must come from Tora's own interface window (top frame, trusted URL)
// Anything else (a page, an extension, an unexpected frame) is ignored and logged.
const PAGE_CHANNELS = new Set([
  'get-settings-sync',
  'user-gesture-ping',
  'scareware-blocked',
  'cookie-banner-rejected',
  'download-media',
  'reader-mode-unavailable',
  'reader-mode-changed',
  'credential-candidate',
  'request-credential-fill',
]);

function trustedUiPrefixes(): string[] {
  if (process.env.NODE_ENV === 'development') return ['http://localhost:3000'];
  return [pathToFileURL(path.join(__dirname, '../dist/index.html')).href.toLowerCase()];
}

function isTrustedSender(channel: string, e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  const senderId = e.sender.id;
  if (PAGE_CHANNELS.has(channel)) {
    return !!findTabByViewContentsId(senderId);
  }
  const isUiWindow = BrowserWindow.getAllWindows().some(w => !w.isDestroyed() && w.webContents.id === senderId);
  if (!isUiWindow) return false;
  const frame = e.senderFrame;
  if (!frame || frame !== e.sender.mainFrame) return false;
  const url = (frame.url || '').toLowerCase();
  return trustedUiPrefixes().some(prefix => url.startsWith(prefix));
}

{
  const originalOn = ipcMain.on.bind(ipcMain);
  const originalHandle = ipcMain.handle.bind(ipcMain);
  (ipcMain as any).on = (channel: string, listener: (...args: any[]) => void) =>
    originalOn(channel, (event: any, ...args: any[]) => {
      if (!isTrustedSender(channel, event)) {
        log.warn(`IPC: ignored "${channel}" from an untrusted sender`);
        if (channel === 'get-settings-sync') event.returnValue = {};
        return;
      }
      listener(event, ...args);
    });
  (ipcMain as any).handle = (channel: string, listener: (...args: any[]) => any) =>
    originalHandle(channel, (event: any, ...args: any[]) => {
      if (!isTrustedSender(channel, event)) {
        log.warn(`IPC: refused "${channel}" from an untrusted sender`);
        throw new Error('Untrusted sender');
      }
      return listener(event, ...args);
    });
}

interface Tab extends TabData {
  view: WebContentsView;
  lastGestureTimestamp: number;
  navigationTimestamps: number[];
  redirectLoopBlockedUntil: number;
  allowPopupUntil: number;
  suspendedUrl?: string;
  /** Detached from its page view while an internal (tora://) or empty page is shown. */
  isParked?: boolean;
  containerId?: string;
  /** URL of the page that failed/was blocked while a Tora error page (data: URL) is shown instead. */
  showingErrorFor?: string;
  certError?: { url: string; host: string; message: string };
  lastActiveAt: number;
  zoomLevel: number;
  isReaderMode?: boolean;
  groupColor?: string;
  lastHistoryEntryId?: string;
  darkModeCssKey?: string;
}

// Internal storage shape — encryptedPassword is a base64 string produced by
// safeStorage.encryptString(), which uses the OS-level credential store (Windows
// Credential Manager / macOS Keychain / libsecret). The plaintext password is NEVER
// written to disk and never held in memory longer than needed to encrypt or hand back
// to an explicit, user-triggered decrypt request.
interface StoredCredential extends CredentialEntry {
  encryptedPassword: string;
}

interface PendingCredential {
  domain: string;
  username: string;
  password: string;
  kind: 'save' | 'update';
  existingId?: string;
  favicon?: string;
}

let activeTabId: string | null = null;
let blocker: ElectronBlocker | null = null;

// Tabs get their own dedicated session, separate from Tora's own UI (the main window's
// webContents, which stays on the default session). This is essential: without it, our
// ad-blocker/content-filter webRequest interceptor below would also apply to Tora's own
// interface — including the dev server page itself — and could block Tora from loading.
let browsingSession: Electron.Session;

app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('media-cache-size', '536870912');

let settings: ToraSettings = {
  isAdBlockEnabled: true,
  isAdultFilterEnabled: false,
  isPopupBlockerEnabled: true,
  isRedirectGuardEnabled: true,
  isScarewareShieldEnabled: true,
  isHttpsUpgradeEnabled: true,
  isPrivacyHeadersEnabled: true,
  isFingerprintProtectionEnabled: true,
  isCookieAutoRejectEnabled: true,
  isVerticalTabsEnabled: false,
  isMediaDownloadEnabled: true,
  isAcceleratedDownloadEnabled: true,
  isVideoStreamTurboEnabled: true,
  searchEngine: 'duckduckgo',
  startupMode: 'restore',
  homepageUrl: '',
  downloadDirectory: '',
  askDownloadLocation: true,
  isUrlCleanerEnabled: true,
  isThirdPartyCookieBlockEnabled: true,
  isReferrerTrimmingEnabled: true,
  isWebRtcProtectionEnabled: true,
  isSafeBrowsingEnabled: true,
  secureDns: 'off',
};

const TAB_STRIP_HEIGHT = 48; // horizontal mode: tab strip height (h-12)
const TOOLBAR_HEIGHT = 56; // horizontal mode: toolbar height (h-14)
const TOTAL_HEADER_HEIGHT = TAB_STRIP_HEIGHT + TOOLBAR_HEIGHT; // 104px total locked top offset
const VERTICAL_SIDEBAR_WIDTH = 232; // vertical mode: tab list as a left sidebar
const VERTICAL_TOOLBAR_HEIGHT = 56; // vertical mode: toolbar alone (h-14)

// Single source of truth for where the BrowserView should sit within the window — used
// by every call site that positions a tab's content area, so horizontal/vertical layout
// only needs to be handled in one place instead of duplicated at each call site.
function applyContentBounds(window: BrowserWindow, tab: Tab) {
  if (isInternalOrEmpty(tab.url)) return;
  const [width, height] = window.getContentSize();

  // HTML5 fullscreen video (or any fullscreen element) — cover the entire window, no
  // toolbar/tab-strip offset, matching how every mainstream browser handles video fullscreen.
  if ((window as any).toraFullscreen) {
    tab.view.setBounds({ x: 0, y: 0, width, height });
    return;
  }

  if (settings.isVerticalTabsEnabled) {
    tab.view.setBounds({
      x: VERTICAL_SIDEBAR_WIDTH,
      y: VERTICAL_TOOLBAR_HEIGHT,
      width: Math.max(0, width - VERTICAL_SIDEBAR_WIDTH),
      height: Math.max(0, height - VERTICAL_TOOLBAR_HEIGHT),
    });
  } else {
    tab.view.setBounds({ x: 0, y: TOTAL_HEADER_HEIGHT, width, height: Math.max(0, height - TOTAL_HEADER_HEIGHT) });
  }
}

// Tracks the last http:// URL we silently upgraded to https:// per web-contents id, so
// did-fail-load can fall back to the original address if the secure version doesn't work.
const httpsUpgradeAttempts = new Map<number, string>();

function shouldSkipHttpsUpgrade(rawUrl: string): boolean {
  try {
    return isLocalOrPrivateHost(new URL(rawUrl).hostname);
  } catch {
    return true;
  }
}

// Hosts the person explicitly chose to open despite an invalid certificate (this run only).
const certExceptions = new Set<string>();

interface WindowState { x?: number; y?: number; width: number; height: number; maximized: boolean }
let windowState: WindowState | null = null;

let adultDomainBlocklist = new Set<string>();

let shortcuts: Shortcut[] = [];
let history: HistoryEntry[] = [];
let downloads: DownloadItem[] = [];
const MAX_DOWNLOADS = 200;

let credentials: StoredCredential[] = [];
let neverSaveDomains = new Set<string>();
const pendingCredentials = new Map<string, PendingCredential>();
interface PendingPermission {
  callback: (granted: boolean) => void;
  tabId: string;
  domain: string;
  permission: string;
}
const pendingPermissionCallbacks = new Map<string, PendingPermission>();

let bookmarks: BookmarkEntry[] = [];

interface PerDomainSettings {
  adBlockDisabled?: boolean;
  darkModeForced?: boolean;
  thirdPartyCookiesAllowed?: boolean;
  permissions?: Record<string, 'granted' | 'denied'>; // key: Electron permission name
}
let perDomainSettings: Record<string, PerDomainSettings> = {};
function getDomainSettings(domain: string): PerDomainSettings {
  return perDomainSettings[domain] || {};
}
function saveDomainSettings() {
  saveData('domain-settings.json', perDomainSettings);
}

interface FocusModeState {
  manuallyEnabled: boolean;
  blockedSites: string[];
  schedule: {
    enabled: boolean;
    startTime: string; // "HH:mm"
    endTime: string;   // "HH:mm"
    days: number[];    // 0=Sunday .. 6=Saturday
  };
}

let focusMode: FocusModeState = {
  manuallyEnabled: false,
  blockedSites: [],
  schedule: { enabled: false, startTime: '09:00', endTime: '18:00', days: [1, 2, 3, 4, 5] },
};

function isFocusModeActiveNow(): boolean {
  if (focusMode.manuallyEnabled) return true;
  if (!focusMode.schedule.enabled) return false;

  const now = new Date();
  if (!focusMode.schedule.days.includes(now.getDay())) return false;

  const [startH, startM] = focusMode.schedule.startTime.split(':').map(Number);
  const [endH, endM] = focusMode.schedule.endTime.split(':').map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // Support overnight windows too (e.g. 22:00 -> 06:00)
  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

let lifetimeStats = {
  adsBlocked: 0,
  popupsBlocked: 0,
  redirectsBlocked: 0,
  scarewareBlocked: 0,
  cookieBannersRejected: 0,
  trackingParamsRemoved: 0,
  thirdPartyCookiesBlocked: 0,
  threatsBlocked: 0,
};
let lifetimeStatsSaveTimer: NodeJS.Timeout | null = null;
function bumpLifetimeStat(key: keyof typeof lifetimeStats, by = 1) {
  lifetimeStats[key] += by;
  if (lifetimeStatsSaveTimer) clearTimeout(lifetimeStatsSaveTimer);
  lifetimeStatsSaveTimer = setTimeout(() => saveData('lifetime-stats.json', lifetimeStats), 2000);
}
let savedSession: { tabs: { url: string; containerId?: string; pinned?: boolean }[]; activeTabId: string | null } | null = null;

// Containers: separate cookie jars (own storage session) so e.g. work, shopping and social
// browsing cannot see each other's logins or trackers.
interface Container { id: string; name: string; color: string }
const MAX_CONTAINERS = 8;
const DEFAULT_CONTAINERS: Container[] = [
  { id: 'work', name: 'Travail', color: '#60A5FA' },
  { id: 'shopping', name: 'Achats', color: '#FBBF24' },
  { id: 'social', name: 'Réseaux sociaux', color: '#C084FC' },
];
let containers: Container[] = DEFAULT_CONTAINERS;
const configuredContainerSessions = new Set<string>();

function containerSession(containerId: string): Electron.Session {
  const ses = session.fromPartition(`persist:container-${containerId}`);
  if (!configuredContainerSessions.has(containerId)) {
    configuredContainerSessions.add(containerId);
    configureSession(ses, false);
  }
  return ses;
}

// Session persistence: last-open tabs are saved on every change (debounced) and restored
// on next launch, like any mainstream browser.
let sessionSaveTimer: NodeJS.Timeout | null = null;

// A simple "smart invert" forced dark mode — the classic technique used by most dark-mode
// browser extensions: invert the whole page's colors via a CSS filter, then invert media
// (images/video/canvas) back so photos and thumbnails don't come out looking like negatives.
// Not perfect on every site, but works broadly without needing a per-site theme.
const FORCED_DARK_CSS = `
html { filter: invert(1) hue-rotate(180deg) !important; background: #fff !important; }
img, video, canvas, svg, picture, iframe, [style*="background-image"] {
  filter: invert(1) hue-rotate(180deg) !important;
}
`;

async function applyForcedDarkMode(tab: Tab, enabled: boolean) {
  try {
    if (enabled) {
      const key = await tab.view.webContents.insertCSS(FORCED_DARK_CSS);
      tab.darkModeCssKey = key;
    } else if (tab.darkModeCssKey) {
      await tab.view.webContents.removeInsertedCSS(tab.darkModeCssKey);
      tab.darkModeCssKey = undefined;
    }
  } catch (err) {}
}

function findTabByViewContentsId(webContentsId: number): { win: BrowserWindow; tab: Tab } | null {
  for (const win of BrowserWindow.getAllWindows()) {
    const tabs = (win as any).toraTabs as Tab[] | undefined;
    const tab = tabs?.find(t => t.view.webContents.id === webContentsId);
    if (tab) return { win, tab };
  }
  return null;
}

function toPublicCredential(c: StoredCredential): CredentialEntry {
  return { id: c.id, domain: c.domain, username: c.username, createdAt: c.createdAt, lastUsedAt: c.lastUsedAt, favicon: c.favicon };
}

function sendAvailableCredentials(tab: Tab) {
  const domain = getRegistrableDomain(tab.url);
  if (!domain) return;
  const matches = credentials
    .filter(c => c.domain === domain)
    .map(c => ({ id: c.id, username: c.username }));
  if (matches.length > 0) {
    tab.view.webContents.send('available-credentials', matches);
  }
}


function applyWebRtcPolicy(wc: Electron.WebContents) {
  try {
    wc.setWebRTCIPHandlingPolicy(settings.isWebRtcProtectionEnabled ? 'default_public_interface_only' : 'default');
  } catch (err) {
    log.warn('WebRTC policy not applied', err);
  }
}

const SECURE_DNS_SERVERS: Record<string, string> = {
  cloudflare: 'https://cloudflare-dns.com/dns-query',
  quad9: 'https://dns.quad9.net/dns-query',
  google: 'https://dns.google/dns-query',
};

function applySecureDns() {
  try {
    const server = SECURE_DNS_SERVERS[settings.secureDns];
    if (!server) app.configureHostResolver({ secureDnsMode: 'off' });
    // "automatic" falls back to the system resolver if the secure server is unreachable,
    // so a DNS-provider outage never leaves the browser unable to load anything.
    else app.configureHostResolver({ secureDnsMode: 'automatic', secureDnsServers: [server] });
  } catch (err) {
    log.warn('Secure DNS not applied', err);
  }
}

// Malware / phishing host lists, refreshed in the background (see threat-feed.ts).
const threatFeed = new ThreatFeed(path.join(app.getPath('userData'), 'threat-hosts.json'), log);
const threatExceptions = new Set<string>();

function hasInterstitial(tab: Tab): boolean {
  return !!(tab.certError || tab.threatWarning);
}

let counterBroadcastTimer: NodeJS.Timeout | null = null;
function noteTabCounter(tab: Tab, key: 'trackingParamsRemoved' | 'thirdPartyCookiesBlocked', by = 1) {
  tab[key] = (tab[key] ?? 0) + by;
  bumpLifetimeStat(key, by);
  if (counterBroadcastTimer) return;
  counterBroadcastTimer = setTimeout(() => { counterBroadcastTimer = null; broadcastTabs(); }, 400);
}

function showBlockedPage(tab: Tab, blockedUrl: string, html: string) {
  tab.showingErrorFor = blockedUrl;
  tab.view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}


// Session persistence: restore the previous session's tabs on next launch, like any
// mainstream browser. Debounced so rapid changes (typing a URL, fast navigation) don't
// hammer the disk — we only actually write ~1s after the last change.
function scheduleSessionSave() {
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(() => {
    sessionSaveTimer = null;
    const win = BrowserWindow.getAllWindows().find(w => !(w as any).toraPrivate);
    if (!win) return;
    const tabs = (win as any).toraTabs as Tab[] | undefined;
    if (!tabs) return;
    // Never persist a currently-crashed tab's URL as-is is fine (URL itself isn't sensitive
    // here), but we do skip empty new-tab placeholders beyond keeping at least one.
    const savedTabs = tabs.filter(t => !t.url.startsWith('data:')).map(t => ({ url: t.url, containerId: t.containerId, pinned: t.isPinned || undefined }));
    saveData('session.json', { tabs: savedTabs, activeTabId: (win as any).toraActiveTabId });
  }, 1000);
}

// Helper to broadcast changes
function broadcastTabs() {
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach(win => {
    // Only broadcast the tabs specific to this window?
    // For simplicity, we share state globally across windows in this scaffold.
    // In a multi-window full architecture, each window would track its own `tabs` array.
    const tabData = (win as any).toraTabs?.map((t: Tab) => ({
      id: t.id,
      url: t.url,
      title: t.title,
      isLoading: t.isLoading,
      canGoBack: t.canGoBack,
      canGoForward: t.canGoForward,
      favicon: t.favicon,
      blockedCount: t.blockedCount,
      popupsBlockedCount: t.popupsBlockedCount,
      redirectsBlockedCount: t.redirectsBlockedCount,
      scarewareBlockedCount: t.scarewareBlockedCount,
      isSuspended: t.isSuspended,
      isCrashed: t.isCrashed,
      zoomLevel: t.zoomLevel,
      isBookmarked: bookmarks.some(b => b.url === t.url),
      isReaderMode: t.isReaderMode,
      groupColor: t.groupColor,
      isAudible: t.isAudible,
      isMuted: t.isMuted,
      isPinned: t.isPinned,
      securityState: (t.certError || t.threatWarning) ? 'broken' : (isInternalOrEmpty(t.url) || !/^https?:/i.test(t.url)) ? 'internal' : t.url.startsWith('https:') ? 'secure' : 'insecure',
      certError: t.certError,
      threatWarning: t.threatWarning,
      container: t.containerId ? containers.find(c => c.id === t.containerId) : undefined,
      trackingParamsRemoved: t.trackingParamsRemoved,
      thirdPartyCookiesBlocked: t.thirdPartyCookiesBlocked,
    })) || [];
    win.webContents.send('tab-updated', tabData, (win as any).toraActiveTabId, { ...settings, isPrivateWindow: !!(win as any).toraPrivate });
  });
  scheduleSessionSave();
}

let downloadsSaveTimer: NodeJS.Timeout | null = null;
function persistDownloadsSoon() {
  if (downloadsSaveTimer) return;
  downloadsSaveTimer = setTimeout(() => {
    downloadsSaveTimer = null;
    saveData('downloads.json', downloads.filter(d => !d.private).slice(0, MAX_DOWNLOADS));
  }, 2000);
}

function broadcastDownloads() {
  if (downloads.length > MAX_DOWNLOADS) downloads.length = MAX_DOWNLOADS;
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('downloads-updated', downloads);
  });
  persistDownloadsSoon();
}

// Live handles for in-progress downloads, so they can be paused / resumed / cancelled.
const activeNativeDownloads = new Map<string, Electron.DownloadItem>();
const activeVideoDownloads = new Map<string, MultiSegmentDownloader>();

// All user data goes through one store: atomic queued writes, rolling backups, corruption recovery.
const store = new JsonStore({
  getDir: () => app.getPath('userData'),
  log,
  onSaveError: (file) => BrowserWindow.getAllWindows().forEach(w => w.webContents.send('storage-error', file)),
});
const readJsonFile = <T,>(file: string, fallback: T): Promise<T> => store.read(file, fallback);
const saveData = (file: string, data: unknown): Promise<void> => store.save(file, data);

async function loadData() {
  const userData = app.getPath('userData');
  shortcuts = await readJsonFile('shortcuts.json', shortcuts);
  history = await readJsonFile('history.json', history);
  settings = { ...settings, ...(await readJsonFile<Partial<ToraSettings>>('settings.json', {})) };
  if (!Object.prototype.hasOwnProperty.call(SEARCH_ENGINES, settings.searchEngine)) settings.searchEngine = 'duckduckgo';
  credentials = await readJsonFile('credentials.json', credentials);
  neverSaveDomains = new Set(await readJsonFile<string[]>('never_save_domains.json', []));
  bookmarks = await readJsonFile('bookmarks.json', bookmarks);
  savedSession = await readJsonFile('session.json', savedSession);
  containers = await readJsonFile<Container[]>('containers.json', DEFAULT_CONTAINERS);
  if (!Array.isArray(containers)) containers = DEFAULT_CONTAINERS;
  lifetimeStats = { ...lifetimeStats, ...(await readJsonFile<Partial<typeof lifetimeStats>>('lifetime-stats.json', {})) };
  focusMode = { ...focusMode, ...(await readJsonFile<Partial<typeof focusMode>>('focus-mode.json', {})) };
  perDomainSettings = await readJsonFile('domain-settings.json', perDomainSettings);
  downloads = (await readJsonFile<DownloadItem[]>('downloads.json', [])).slice(0, MAX_DOWNLOADS).map(d => ({
    ...d,
    // A download that was running when the app closed cannot be running now.
    state: d.state === 'progressing' ? 'interrupted' : d.state,
    paused: false,
  }));
  windowState = await readJsonFile<WindowState | null>('window-state.json', null);
  log.info('Tora data loaded from', userData);
}

async function fetchAdultBlocklist() {
  try {
    const cachePath = path.join(app.getPath('userData'), 'adult_hosts.txt');
    let text = '';
    try {
      const stats = await fs.stat(cachePath);
      if (Date.now() - stats.mtimeMs < 24 * 60 * 60 * 1000) {
        text = await fs.readFile(cachePath, 'utf8');
      }
    } catch(e) {}
    if (!text) {
      const res = await fetch('https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn/hosts');
      text = await res.text();
      fs.writeFile(cachePath, text).catch(() => {});
    }
    const lines = text.split('\n');
    lines.forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const parts = line.split(/\s+/);
      if (parts.length >= 2 && (parts[0] === '0.0.0.0' || parts[0] === '127.0.0.1')) {
        adultDomainBlocklist.add(parts[1]);
      }
    });
  } catch (err) {}
}

function restoreWindowBounds(): WindowState | null {
  if (!windowState || !Number.isFinite(windowState.width) || !Number.isFinite(windowState.height)) return null;
  if (windowState.x === undefined || windowState.y === undefined) return windowState;
  // Only reuse the position if the window would still be visible on a connected screen.
  const visible = screen.getAllDisplays().some(d => {
    const a = d.workArea;
    const overlapX = Math.min(windowState!.x! + windowState!.width, a.x + a.width) - Math.max(windowState!.x!, a.x);
    const overlapY = Math.min(windowState!.y! + windowState!.height, a.y + a.height) - Math.max(windowState!.y!, a.y);
    return overlapX >= 120 && overlapY >= 80;
  });
  return visible ? windowState : { width: windowState.width, height: windowState.height, maximized: windowState.maximized };
}

function saveWindowStateNow(win: BrowserWindow) {
  if (win.isDestroyed() || (win as any).toraPrivate || win.isFullScreen()) return;
  const b = win.getNormalBounds();
  windowState = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() };
  try { writeFileSync(path.join(app.getPath('userData'), 'window-state.json'), JSON.stringify(windowState)); } catch (err) { log.warn('Window state not saved', err); }
}

function createNewWindow(options: { isPrivate?: boolean } = {}) {
  const isPrivate = !!options.isPrivate;
  const firstNormalWindow = !isPrivate && !BrowserWindow.getAllWindows().some(w => !(w as any).toraPrivate);
  const initial = firstNormalWindow ? restoreWindowBounds() : null;
  const mainWindow = new BrowserWindow({
    width: initial?.width ?? 1200,
    height: initial?.height ?? 800,
    ...(initial?.x !== undefined && initial?.y !== undefined ? { x: initial.x, y: initial.y } : {}),
    minWidth: 640,
    minHeight: 480,
    icon: path.join(__dirname, '../resources/icon.png'),
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    }
  });

  // Tora's own interface must never navigate away or open windows (e.g. a file or link
  // dropped on it): it would keep the privileged preload while showing foreign content.
  mainWindow.webContents.on('will-navigate', (e, targetUrl) => {
    if (!trustedUiPrefixes().some(prefix => targetUrl.toLowerCase().startsWith(prefix))) e.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  (mainWindow as any).toraTabs = [];
  (mainWindow as any).toraActiveTabId = null;
  (mainWindow as any).toraClosedTabs = [];

  if (initial?.maximized) mainWindow.maximize();

  if (isPrivate) {
    // Private window: its own in-memory session (no persist: prefix) that is wiped on close.
    const privateSession = session.fromPartition(`private-${crypto.randomUUID()}`);
    configureSession(privateSession, true);
    (mainWindow as any).toraPrivate = true;
    (mainWindow as any).toraSession = privateSession;
    mainWindow.on('closed', () => {
      privateSession.clearStorageData().catch(() => {});
      privateSession.clearCache().catch(() => {});
      downloads = downloads.filter(d => !d.private || d.state === 'progressing');
      persistDownloadsSoon();
    });
  } else {
    let stateTimer: NodeJS.Timeout | null = null;
    const saveSoon = () => {
      if (stateTimer) clearTimeout(stateTimer);
      stateTimer = setTimeout(() => saveWindowStateNow(mainWindow), 600);
    };
    mainWindow.on('resize', saveSoon);
    mainWindow.on('move', saveSoon);
    mainWindow.on('close', () => saveWindowStateNow(mainWindow));
  }

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  registerShortcuts(mainWindow, mainWindow.webContents);

  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized-change', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized-change', false));

  mainWindow.on('resize', () => {
    const tabs = (mainWindow as any).toraTabs;
    const activeTabId = (mainWindow as any).toraActiveTabId;
    if (!activeTabId) return;
    const tab = tabs.find((t: Tab) => t.id === activeTabId);
    if (!tab) return;
    applyContentBounds(mainWindow, tab);
  });

  // The OS-level fullscreen transition triggered by setFullScreen() is animated/async — by
  // the time it actually finishes, the window's real final size may differ from what was
  // available synchronously when we first reacted to the page's fullscreen request. These
  // fire once the transition is actually complete, so the video reliably ends up covering
  // the true final window size rather than a stale, pre-transition one.
  mainWindow.on('enter-full-screen', () => {
    const tabs = (mainWindow as any).toraTabs;
    const activeTabId = (mainWindow as any).toraActiveTabId;
    const tab = tabs?.find((t: Tab) => t.id === activeTabId);
    if (tab) applyContentBounds(mainWindow, tab);
  });
  mainWindow.on('leave-full-screen', () => {
    const tabs = (mainWindow as any).toraTabs;
    const activeTabId = (mainWindow as any).toraActiveTabId;
    const tab = tabs?.find((t: Tab) => t.id === activeTabId);
    if (tab) applyContentBounds(mainWindow, tab);
  });

  // IMPORTANT: create the first tab(s) (and broadcast them) only once the window's own page
  // has actually finished loading. Doing it immediately after loadURL() races the React app's
  // mount — the very first `tab-updated` broadcast would fire before anything is listening
  // for it and gets silently lost, leaving the UI with no active tab at all (no branding, and
  // the address bar has nowhere to send navigation since it has no activeTabId).
  mainWindow.webContents.on('did-finish-load', () => {
    if ((mainWindow as any).toraTabs.length > 0) return;

    if (isPrivate) {
      createTab(mainWindow);
      return;
    }
    if (settings.startupMode === 'homepage' && settings.homepageUrl) {
      const home = sanitizeNavigationUrl(settings.homepageUrl, settings.searchEngine);
      createTab(mainWindow, home.valid ? home.url : '');
      return;
    }
    if (settings.startupMode === 'newtab') {
      createTab(mainWindow);
      return;
    }
    if (savedSession && savedSession.tabs.length > 0) {
      log.info(`Restoring previous session: ${savedSession.tabs.length} tab(s)`);
      savedSession.tabs.forEach((t) => {
        createTab(mainWindow, t.url, containers.some(c => c.id === t.containerId) ? t.containerId : undefined);
        if (t.pinned) {
          const restored = (mainWindow as any).toraTabs as Tab[];
          restored[restored.length - 1].isPinned = true;
        }
      });
      // createTab() always switches focus to the newly created tab, so after the loop the
      // last restored tab ends up active — a reasonable approximation without needing to
      // track stable tab IDs across restarts.
    } else {
      createTab(mainWindow);
    }
  });
}

const INTERNAL_TITLES: Record<string, string> = {
  'tora://settings': 'Paramètres',
  'tora://history': 'Historique',
  'tora://downloads': 'Téléchargements',
  'tora://extensions': 'Protections',
  'tora://passwords': 'Mots de passe',
  'tora://focus': 'Mode Focus',
  'tora://about': 'À propos',
  'tora://bookmarks': 'Favoris',
};

function createTab(window: BrowserWindow, url = '', containerId?: string) {
  const tabs = (window as any).toraTabs;

  // Chrome-like behaviour: internal pages (Settings, etc.) are singletons — reuse the
  // existing tab instead of opening a duplicate every time.
  if (isInternalUrl(url)) {
    const existing = tabs.find((t: Tab) => t.url === url);
    if (existing) {
      switchTab(window, existing.id);
      return;
    }
  }

  const id = Math.random().toString(36).substring(2, 11);
  const isPrivate = !!(window as any).toraPrivate;
  // Private windows have one in-memory session and no containers; otherwise a known container
  // gets its own storage session.
  const activeContainerId = !isPrivate && containerId && containers.some(c => c.id === containerId) ? containerId : undefined;
  const tabSession: Electron.Session = (window as any).toraSession ?? (activeContainerId ? containerSession(activeContainerId) : browsingSession);
  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'view-preload.js'),
      session: tabSession,
      spellcheck: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    }
  });


  const tab: Tab = {
    id,
    view,
    url,
    title: isInternalUrl(url) ? (INTERNAL_TITLES[url] || 'Tora') : (url ? 'Loading...' : 'New Tab'),
    isLoading: !!url && !isInternalUrl(url),
    canGoBack: false,
    canGoForward: false,
    blockedCount: 0,
    popupsBlockedCount: 0,
    redirectsBlockedCount: 0,
    scarewareBlockedCount: 0,
    isSuspended: false,
    isCrashed: false,
    lastGestureTimestamp: Date.now(),
    navigationTimestamps: [],
    redirectLoopBlockedUntil: 0,
    allowPopupUntil: 0,
    lastActiveAt: Date.now(),
    zoomLevel: 0,
    trackingParamsRemoved: 0,
    thirdPartyCookiesBlocked: 0,
    containerId: activeContainerId,
  };

  tabs.push(tab);
  applyWebRtcPolicy(view.webContents);
  scheduleSessionSave();
  registerShortcuts(window, view.webContents);

  view.webContents.on('did-start-loading', () => {
    tab.isLoading = true;
    broadcastTabs();
  });

  // HTML5 fullscreen (video players, etc.): without explicitly handling these events, our
  // manually-managed BrowserView bounds never change, so a page's fullscreen request has
  // nowhere to expand into — visually nothing happens when clicking the fullscreen button.
  view.webContents.on('enter-html-full-screen', () => {
    (window as any).toraFullscreen = true;
    applyContentBounds(window, tab); // instant feedback, even before the OS transition finishes
    window.setFullScreen(true);
    window.webContents.send('fullscreen-change', true);
  });
  view.webContents.on('leave-html-full-screen', () => {
    (window as any).toraFullscreen = false;
    window.setFullScreen(false);
    applyContentBounds(window, tab);
    window.webContents.send('fullscreen-change', false);
  });

  view.webContents.on('found-in-page', (e, result) => {
    window.webContents.send('find-in-page-result', { matches: result.matches, activeMatchOrdinal: result.activeMatchOrdinal });
  });

  view.webContents.on('media-started-playing', () => {
    tab.isAudible = true;
    broadcastTabs();
  });

  view.webContents.on('media-paused', () => {
    tab.isAudible = view.webContents.isCurrentlyAudible();
    broadcastTabs();
  });

  view.webContents.on('did-start-navigation', (e, url, isInPlace, isMainFrame) => {
    if (isMainFrame) {
      tab.blockedCount = 0;
      tab.popupsBlockedCount = 0;
      tab.redirectsBlockedCount = 0;
      tab.scarewareBlockedCount = 0;
      tab.isReaderMode = false; // a fresh page load naturally discards the reader overlay
      broadcastTabs();
    }
  });

  // Custom error page instead of a blank tab when a page fails to load (offline, DNS
  // failure, connection refused, etc). -3 is Chromium's ERR_ABORTED, which fires on normal
  // cancelled navigations (e.g. clicking a link away before a page finished) and must be
  // ignored, not treated as a real failure.
  view.webContents.on('did-fail-load', (e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    if (tab.threatWarning) return; // blocked on purpose: the warning page is already showing

    // If this failure is for a URL we silently upgraded from http:// to https://, and the
    // failure looks like a real connectivity issue (not just Tora blocking it on purpose),
    // fall back to the original http:// address instead of showing an error page.
    const upgradedFrom = httpsUpgradeAttempts.get(view.webContents.id);
    if (upgradedFrom && validatedURL.startsWith('https://') && errorCode !== -20 /* BLOCKED_BY_CLIENT */) {
      httpsUpgradeAttempts.delete(view.webContents.id);
      log.info(`HTTPS upgrade failed for ${validatedURL}, falling back to ${upgradedFrom}`);
      view.webContents.loadURL(upgradedFrom);
      return;
    }

    // Invalid certificate: Tora shows its own warning page (rendered by the interface) with an
    // explicit, per-site "continue anyway" choice instead of a dead-end error.
    if (errorCode <= -200 && errorCode >= -220) {
      let host = '';
      try { host = new URL(validatedURL).hostname; } catch {}
      tab.isLoading = false;
      tab.url = validatedURL;
      tab.title = host || validatedURL;
      tab.certError = { url: validatedURL, host, message: certErrorMessage(errorCode) };
      try { window.contentView.removeChildView(view); } catch {}
      broadcastTabs();
      return;
    }

    log.warn(`Page failed to load: ${validatedURL} (${errorCode} ${errorDescription})`);
    tab.isLoading = false;
    tab.showingErrorFor = validatedURL;
    const errorHtml = buildErrorPage(validatedURL, errorCode, errorDescription);
    view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
    broadcastTabs();
  });

  view.webContents.on('render-process-gone', (_event, details) => {
    log.error(`Tab ${tab.id} render process gone: ${details.reason} (exitCode: ${details.exitCode})`);
    tab.isCrashed = true;
    tab.isLoading = false;
    broadcastTabs();
  });

  view.webContents.on('unresponsive', () => {
    log.warn(`Tab ${tab.id} render process became unresponsive`);
  });

  // If the page's renderer process crashes outright (not just a load failure), show a
  // recovery screen with a reload button instead of leaving the tab permanently blank.
  view.webContents.on('render-process-gone', (e, details) => {
    if (details.reason === 'clean-exit') return;
    log.error(`Renderer process gone for tab ${tab.id}: ${details.reason}`);
    tab.isCrashed = true;
    tab.isLoading = false;
    broadcastTabs();
  });

  // Native right-click context menu (copy/paste/inspect/open-in-new-tab) — Electron shows
  // nothing by default without this.
  view.webContents.on('context-menu', (e, params) => {
    const wc = view.webContents;
    const items: Electron.MenuItemConstructorOptions[] = [];
    const sep = () => { if (items.length && items[items.length - 1].type !== 'separator') items.push({ type: 'separator' }); };
    const isWebUrl = (u: string) => /^https?:\/\//i.test(u);

    // Spelling suggestions come first, like every mainstream browser.
    if (params.isEditable && params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        items.push({ label: suggestion, click: () => wc.replaceMisspelling(suggestion) });
      }
      if (params.dictionarySuggestions.length === 0) items.push({ label: 'Aucune suggestion', enabled: false });
      items.push({ label: 'Ajouter au dictionnaire', click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord) });
      sep();
    }

    if (params.linkURL) {
      items.push({ label: 'Ouvrir le lien dans un nouvel onglet', click: () => { if (isWebUrl(params.linkURL)) createTab(window, params.linkURL, tab.containerId); } });
      items.push({ label: 'Copier l\'adresse du lien', click: () => clipboard.writeText(settings.isUrlCleanerEnabled ? cleanTrackingParams(params.linkURL).url : params.linkURL) });
      items.push({ label: 'Enregistrer le lien sous…', click: () => { if (isWebUrl(params.linkURL)) wc.downloadURL(params.linkURL); } });
      sep();
    }

    if (params.mediaType === 'image' && params.srcURL) {
      items.push({ label: 'Ouvrir l\'image dans un nouvel onglet', click: () => { if (isWebUrl(params.srcURL)) createTab(window, params.srcURL); } });
      items.push({ label: 'Enregistrer l\'image sous…', click: () => { if (isWebUrl(params.srcURL)) wc.downloadURL(params.srcURL); } });
      items.push({ label: 'Copier l\'image', click: () => wc.copyImageAt(params.x, params.y) });
      items.push({ label: 'Copier l\'adresse de l\'image', click: () => clipboard.writeText(params.srcURL) });
      sep();
    }

    if ((params.mediaType === 'video' || params.mediaType === 'audio') && params.srcURL) {
      const kind = params.mediaType === 'video' ? 'la vidéo' : 'l\'audio';
      items.push({ label: `Enregistrer ${kind} sous…`, click: () => { if (isWebUrl(params.srcURL)) wc.downloadURL(params.srcURL); } });
      items.push({ label: `Copier l'adresse de ${kind}`, click: () => clipboard.writeText(params.srcURL) });
      sep();
    }

    if (params.isEditable) {
      items.push({ label: 'Annuler', role: 'undo', enabled: params.editFlags.canUndo });
      items.push({ label: 'Rétablir', role: 'redo', enabled: params.editFlags.canRedo });
      sep();
      items.push({ label: 'Couper', role: 'cut', enabled: params.editFlags.canCut });
      items.push({ label: 'Copier', role: 'copy', enabled: params.editFlags.canCopy });
      items.push({ label: 'Coller', role: 'paste', enabled: params.editFlags.canPaste });
      items.push({ label: 'Tout sélectionner', role: 'selectAll', enabled: params.editFlags.canSelectAll });
      sep();
    } else if (params.selectionText) {
      const text = params.selectionText.trim();
      const shown = text.length > 30 ? text.slice(0, 30) + '…' : text;
      const engine = SEARCH_ENGINE_LABELS[settings.searchEngine] || 'le moteur de recherche';
      items.push({ label: 'Copier', role: 'copy' });
      items.push({ label: `Rechercher « ${shown} » avec ${engine}`, click: () => createTab(window, buildSearchUrl(text, settings.searchEngine)) });
      sep();
    }

    if (!params.isEditable && !params.selectionText && !params.linkURL && params.mediaType === 'none') {
      items.push({ label: 'Retour', enabled: wc.canGoBack(), click: () => wc.goBack() });
      items.push({ label: 'Avancer', enabled: wc.canGoForward(), click: () => wc.goForward() });
      items.push({ label: 'Recharger', click: () => wc.reload() });
      sep();
      items.push({ label: 'Imprimer…', click: () => wc.print({ printBackground: true }) });
      items.push({ label: 'Enregistrer la page sous…', click: () => { savePageHtml(window); } });
      items.push({ label: 'Afficher le code source', click: () => openViewSource(window) });
      items.push({ label: 'Sélectionner tout', role: 'selectAll' });
      sep();
    }

    items.push({ label: "Inspecter l'élément", click: () => wc.inspectElement(params.x, params.y) });
    Menu.buildFromTemplate(items).popup();
  });

  const handleNavigation = (e: any, targetUrl: string) => {
    if (!settings.isRedirectGuardEnabled) return;
    
    const now = Date.now();
    tab.navigationTimestamps.push(now);
    tab.navigationTimestamps = tab.navigationTimestamps.filter(t => now - t <= 5000);
    
    if (now < tab.redirectLoopBlockedUntil) {
      e.preventDefault();
      return;
    }
    if (tab.navigationTimestamps.length > 3) {
      e.preventDefault();
      tab.redirectLoopBlockedUntil = now + 5000;
      window.webContents.send('protection-event', tab.id, 'loop');
      return;
    }
    if (now - tab.lastGestureTimestamp > 1500) {
      e.preventDefault();
      tab.redirectsBlockedCount++; bumpLifetimeStat("redirectsBlocked");
      broadcastTabs();
      window.webContents.send('protection-event', tab.id, 'redirect', targetUrl);
      return;
    }
    tab.lastGestureTimestamp = now;
  };

  view.webContents.on('will-navigate', (e, url) => handleNavigation(e, url));
  view.webContents.on('will-redirect', (e, url) => handleNavigation(e, url));

  view.webContents.setWindowOpenHandler((details) => {
    if (!settings.isPopupBlockerEnabled) return { action: 'allow' };

    const now = Date.now();
    if (now < tab.allowPopupUntil) {
      // Open it as a proper managed Tora tab (with ad-blocking, protections, and normal
      // UI chrome) instead of letting Electron spawn a bare, undecorated native window.
      createTab(window, details.url, tab.containerId);
      return { action: 'deny' };
    }

    tab.popupsBlockedCount++; bumpLifetimeStat("popupsBlocked");
    broadcastTabs();
    window.webContents.send('protection-event', tab.id, 'popup', details.url);
    return { action: 'deny' };
  });

  view.webContents.on('did-stop-loading', () => {
    if (tab.isParked) return;
    tab.isLoading = false;
    tab.canGoBack = view.webContents.canGoBack();
    tab.canGoForward = view.webContents.canGoForward();
    tab.title = view.webContents.getTitle() || tab.url;
    broadcastTabs();
    sendAvailableCredentials(tab);

    // Re-apply forced dark mode on every fresh page load for this domain (CSS injections
    // don't persist across navigations on their own).
    const domainForDark = getRegistrableDomain(tab.url);
    if (domainForDark && getDomainSettings(domainForDark).darkModeForced) {
      applyForcedDarkMode(tab, true);
    }
    
    // History sync — target the exact entry this navigation created (by id), not just
    // "the first entry in the list", which broke as soon as another tab navigated in
    // between and became the new most-recent entry.
    if (tab.url !== '' && tab.url !== 'about:blank' && tab.lastHistoryEntryId) {
      const existing = history.find(h => h.id === tab.lastHistoryEntryId);
      if (existing) {
        existing.title = tab.title;
        existing.favicon = tab.favicon;
        saveData('history.json', history);
      }
    }
  });

  view.webContents.on('page-title-updated', (e, title) => {
    tab.title = title;
    if (tab.lastHistoryEntryId) {
      const existing = history.find(h => h.id === tab.lastHistoryEntryId);
      if (existing) { existing.title = title; saveData('history.json', history); }
    }
    broadcastTabs();
  });

  view.webContents.on('page-favicon-updated', (e, favicons) => {
    if (favicons && favicons.length > 0) {
      tab.favicon = favicons[0];
      if (tab.lastHistoryEntryId) {
        const existing = history.find(h => h.id === tab.lastHistoryEntryId);
        if (existing) { existing.favicon = tab.favicon; saveData('history.json', history); }
      }
      broadcastTabs();
    }
  });

  view.webContents.on('did-navigate', (e, newUrl) => {
    // Suspension parks the tab on about:blank internally while keeping tab.suspendedUrl as
    // the real address — this navigation event must NOT overwrite tab.url with 'about:blank'
    // (which would show a blank address bar and desync the rest of the UI). switchTab()
    // clears isSuspended itself right before triggering the real reload, so by the time
    // THAT did-navigate fires, isSuspended is already false and it updates tab.url normally.
    if (tab.isSuspended && newUrl === 'about:blank') return;
    if (tab.isParked) return;
    // A Tora error/blocked page is a data: URL internally: keep showing the address that failed.
    if (newUrl.startsWith('data:text/html') && tab.showingErrorFor) {
      tab.url = tab.showingErrorFor;
      broadcastTabs();
      return;
    }
    tab.showingErrorFor = undefined;
    tab.certError = undefined;
    tab.threatWarning = undefined;
    tab.url = newUrl;
    httpsUpgradeAttempts.delete(view.webContents.id); // navigation succeeded, no fallback needed
    broadcastTabs();
    
    if (newUrl !== '' && newUrl !== 'about:blank' && !isPrivate && /^https?:/i.test(newUrl)) {
      const id = Date.now().toString() + Math.random().toString();
      tab.lastHistoryEntryId = id;
      history.unshift({
        id,
        url: newUrl,
        title: tab.title,
        favicon: tab.favicon, // best-effort at creation time; page-favicon-updated backfills the real one below
        timestamp: Date.now()
      });
      if (history.length > 500) history.pop();
      saveData('history.json', history);
    }
  });
  
  view.webContents.on('did-navigate-in-page', (e, newUrl) => {
    tab.url = newUrl;
    broadcastTabs();
  });

  if (url && !isInternalUrl(url)) view.webContents.loadURL(url);
  switchTab(window, id);
}

function switchTab(window: BrowserWindow, id: string) {
  pipManager.closePipForTab(id);
  const tabs = (window as any).toraTabs;
  const tab = tabs.find((t: Tab) => t.id === id);
  if (!tab) return;

  const activeTabId = (window as any).toraActiveTabId;
  if (activeTabId && activeTabId !== id) {
    const oldTab = tabs.find((t: Tab) => t.id === activeTabId);
    if (oldTab) {
      window.contentView.removeChildView(oldTab.view);
      // Auto-PiP: If leaving a tab that is actively playing video, detach into PiP
      if (!isInternalOrEmpty(oldTab.url) && !oldTab.view.webContents.isDestroyed()) {
        oldTab.view.webContents.executeJavaScript(`
          (() => {
            const v = document.querySelector('video');
            return !!(v && !v.paused && !v.ended && v.currentTime > 0);
          })()
        `).then((isPlaying: boolean) => {
          if (isPlaying) {
            pipManager.triggerAutoPip(oldTab.id, oldTab.url, window);
          }
        }).catch(() => {});
      }
    }
  }

  tab.lastActiveAt = Date.now();

  // Waking up a suspended tab: it was parked on about:blank to free memory, so reload
  // its real URL now that the user has come back to it.
  if (tab.isSuspended && tab.suspendedUrl) {
    tab.isSuspended = false;
    tab.isLoading = true;
    tab.view.webContents.loadURL(tab.suspendedUrl);
    tab.suspendedUrl = undefined;
  }

  (window as any).toraActiveTabId = id;
  const overlayReasons: Set<string> = (window as any).toraOverlayReasons || new Set();
  if (!isInternalOrEmpty(tab.url) && !hasInterstitial(tab)) {
    if (overlayReasons.size === 0) {
      window.contentView.addChildView(tab.view);
      applyContentBounds(window, tab);
    }
  }
  broadcastTabs();
}

function openDevToolsForActiveTab(window: BrowserWindow) {
  const tabs = (window as any).toraTabs;
  const activeTabId = (window as any).toraActiveTabId;
  const tab = tabs?.find((t: Tab) => t.id === activeTabId);

  if (tab && !isInternalOrEmpty(tab.url)) {
    // A real visited page — inspect the BrowserView's own content.
    tab.view.webContents.openDevTools({ mode: 'detach' });
  } else {
    // New-tab page or an internal tora:// page — these are rendered by Tora's own React
    // UI (the main window's webContents), not a BrowserView, so that's what needs
    // inspecting here. Without this branch, DevTools silently did nothing at all
    // whenever the new-tab page or a tora:// page was showing.
    window.webContents.openDevTools({ mode: 'detach' });
  }
}

function getActiveTab(window: BrowserWindow): Tab | undefined {
  const tabs = (window as any).toraTabs as Tab[] | undefined;
  const activeTabId = (window as any).toraActiveTabId;
  return tabs?.find(t => t.id === activeTabId);
}

const ZOOM_STEP = 0.5;
const ZOOM_MIN = -4; // ~50%
const ZOOM_MAX = 5;  // ~300%

function applyZoom(window: BrowserWindow, delta: number | 'reset') {
  const tab = getActiveTab(window);
  if (!tab || isInternalOrEmpty(tab.url)) return;
  tab.zoomLevel = delta === 'reset' ? 0 : Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, tab.zoomLevel + delta));
  tab.view.webContents.setZoomLevel(tab.zoomLevel);
  broadcastTabs();
}

function switchToAdjacentTab(window: BrowserWindow, direction: 1 | -1) {
  const tabs = (window as any).toraTabs as Tab[];
  const activeTabId = (window as any).toraActiveTabId;
  if (!tabs || tabs.length < 2) return;
  const idx = tabs.findIndex(t => t.id === activeTabId);
  if (idx === -1) return;
  const nextIdx = (idx + direction + tabs.length) % tabs.length;
  switchTab(window, tabs[nextIdx].id);
}

function attachViewIfActive(win: BrowserWindow, tab: Tab) {
  const overlayReasons: Set<string> = (win as any).toraOverlayReasons || new Set();
  if ((win as any).toraActiveTabId === tab.id && overlayReasons.size === 0 && !isInternalOrEmpty(tab.url) && !hasInterstitial(tab)) {
    win.contentView.addChildView(tab.view);
    applyContentBounds(win, tab);
  }
}

function getDownloadDir(): string {
  const dir = settings.downloadDirectory;
  return dir && path.isAbsolute(dir) && existsSync(dir) ? dir : app.getPath('downloads');
}

// "name.ext" -> "name (1).ext" when the file already exists, so nothing is ever overwritten.
function uniqueFilePath(dir: string, fileName: string): string {
  const safeName = fileName.replace(/[\\/:*?"<>|]+/g, '_') || 'download';
  const ext = path.extname(safeName);
  const base = path.basename(safeName, ext);
  let candidate = path.join(dir, safeName);
  for (let i = 1; existsSync(candidate) && i < 1000; i++) {
    candidate = path.join(dir, `${base} (${i})${ext}`);
  }
  return candidate;
}

function sanitizeFileName(name: string): string {
  return (name || 'page').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 80) || 'page';
}

function reopenClosedTab(window: BrowserWindow) {
  const closed = (window as any).toraClosedTabs as { url: string; title: string }[] | undefined;
  const last = closed?.pop();
  if (last) createTab(window, last.url);
}

function printActiveTab(window: BrowserWindow) {
  const tab = getActiveTab(window);
  if (!tab || isInternalOrEmpty(tab.url) || hasInterstitial(tab)) return;
  tab.view.webContents.print({ printBackground: true });
}

async function savePagePdf(window: BrowserWindow) {
  const tab = getActiveTab(window);
  if (!tab || isInternalOrEmpty(tab.url) || hasInterstitial(tab)) return;
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Enregistrer la page en PDF',
    defaultPath: path.join(getDownloadDir(), `${sanitizeFileName(tab.title)}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return;
  try {
    const data = await tab.view.webContents.printToPDF({ printBackground: true });
    await fs.writeFile(filePath, data);
  } catch (err) {
    log.error('Save as PDF failed:', err);
    dialog.showErrorBox('Enregistrement impossible', "La page n'a pas pu être enregistrée en PDF.");
  }
}

async function savePageHtml(window: BrowserWindow) {
  const tab = getActiveTab(window);
  if (!tab || isInternalOrEmpty(tab.url) || hasInterstitial(tab)) return;
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Enregistrer la page sous',
    defaultPath: path.join(getDownloadDir(), `${sanitizeFileName(tab.title)}.html`),
    filters: [{ name: 'Page web complète', extensions: ['html'] }],
  });
  if (canceled || !filePath) return;
  try {
    await tab.view.webContents.savePage(filePath, 'HTMLComplete');
  } catch (err) {
    log.error('Save page failed:', err);
    dialog.showErrorBox('Enregistrement impossible', "La page n'a pas pu être enregistrée.");
  }
}

function openViewSource(window: BrowserWindow) {
  const tab = getActiveTab(window);
  if (!tab || !/^https?:\/\//i.test(tab.url)) return;
  createTab(window, `view-source:${tab.url}`);
}

// Registers keyboard shortcuts on a given WebContents (the main window's own UI, AND each
// tab's BrowserView individually — Electron delivers keyboard input to whichever WebContents
// currently has focus, so without attaching to BOTH, shortcuts would stop working the moment
// the user clicks into a web page instead of the address bar).
function registerShortcuts(window: BrowserWindow, webContents: Electron.WebContents) {
  webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta; // support both Ctrl (Win/Linux) and Cmd (Mac)
    const key = input.key.toLowerCase();
    const handled = () => event.preventDefault();

    const isDevToolsShortcut = input.key === 'F12' || (mod && input.shift && key === 'i');
    if (isDevToolsShortcut) { openDevToolsForActiveTab(window); handled(); return; }

    if (input.key === 'F5') {
      const tab = getActiveTab(window);
      if (tab && !isInternalOrEmpty(tab.url) && !hasInterstitial(tab)) tab.view.webContents.reload();
      handled();
      return;
    }

    // Alt+← / Alt+→ : history navigation
    if (input.alt && !mod && (key === 'arrowleft' || key === 'arrowright')) {
      const tab = getActiveTab(window);
      if (tab && !isInternalOrEmpty(tab.url)) {
        const wc = tab.view.webContents;
        if (key === 'arrowleft' && wc.canGoBack()) wc.goBack();
        if (key === 'arrowright' && wc.canGoForward()) wc.goForward();
      }
      handled();
      return;
    }

    if (!mod) return;

    if (key === 't' && input.shift) { reopenClosedTab(window); handled(); return; }
    if (key === 't') { createTab(window); handled(); return; }
    if (key === 'n' && input.shift) { createNewWindow({ isPrivate: true }); handled(); return; }
    if (key === 'n') { createNewWindow(); handled(); return; }
    if (key === 'w' && !input.shift) {
      const tab = getActiveTab(window);
      if (tab) closeTab(window, tab.id);
      handled();
      return;
    }
    if (key === 'l') { window.webContents.send('focus-address-bar'); handled(); return; }
    if (key === 'f') { window.webContents.send('show-find-bar'); handled(); return; }
    if (key === 'tab' || key === 'pagedown' || key === 'pageup') {
      const backwards = key === 'pageup' || (key === 'tab' && input.shift);
      switchToAdjacentTab(window, backwards ? -1 : 1);
      handled();
      return;
    }
    if (/^[1-9]$/.test(key)) {
      const tabs = ((window as any).toraTabs || []) as Tab[];
      const target = key === '9' ? tabs[tabs.length - 1] : tabs[Number(key) - 1];
      if (target) switchTab(window, target.id);
      handled();
      return;
    }
    if (key === '=' || key === '+') { applyZoom(window, ZOOM_STEP); handled(); return; }
    if (key === '-') { applyZoom(window, -ZOOM_STEP); handled(); return; }
    if (key === '0') { applyZoom(window, 'reset'); handled(); return; }
    if (key === 'r') {
      const tab = getActiveTab(window);
      if (tab && !isInternalOrEmpty(tab.url) && !hasInterstitial(tab)) {
        if (input.shift) tab.view.webContents.reloadIgnoringCache(); else tab.view.webContents.reload();
      }
      handled();
      return;
    }
    if (key === 'd' && !input.shift) { window.webContents.send('shortcut-action', 'bookmark'); handled(); return; }
    if (key === 'h') { createTab(window, 'tora://history'); handled(); return; }
    if (key === 'j') { createTab(window, 'tora://downloads'); handled(); return; }
    if (key === 'p') { printActiveTab(window); handled(); return; }
    if (key === 's') { savePageHtml(window); handled(); return; }
    if (key === 'u') { openViewSource(window); handled(); return; }
    if (key === 'delete' && input.shift) { createTab(window, 'tora://settings'); handled(); return; }
  });
}

function closeTab(window: BrowserWindow, id: string) {
  const tabs = (window as any).toraTabs;
  const index = tabs.findIndex((t: Tab) => t.id === id);
  if (index === -1) return;

  const tab = tabs[index];
  const activeTabId = (window as any).toraActiveTabId;

  if (!(window as any).toraPrivate && tab.url && !tab.url.startsWith('data:') && tab.url !== 'about:blank') {
    const closed = ((window as any).toraClosedTabs ||= []) as { url: string; title: string }[];
    closed.push({ url: tab.url, title: tab.title });
    if (closed.length > 25) closed.shift();
  }

  if (activeTabId === id) window.contentView.removeChildView(tab.view);
  httpsUpgradeAttempts.delete(tab.view.webContents.id);
  mediaGrabber.clearTab(id);
  pipManager.closePipForTab(id);
  for (const [pId, pending] of pendingPermissionCallbacks.entries()) {
    if (pending.tabId === id) {
      try { pending.callback(false); } catch {}
      pendingPermissionCallbacks.delete(pId);
    }
  }
  
  try { if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close({ waitForBeforeUnload: false }); } catch (err) {}
  tabs.splice(index, 1);

  if (tabs.length === 0) {
    window.close();
    return;
  }

  if (activeTabId === id) {
    const nextIndex = Math.max(0, index - 1);
    switchTab(window, tabs[nextIndex].id);
  } else {
    broadcastTabs();
  }
}

// Everything a browsing session needs to behave like Tora: filtering, privacy headers,
// permission prompts, download tracking and spell checking. Applied to the normal session
// and to every private window's own in-memory session.
function configureSession(ses: Electron.Session, isPrivate: boolean) {
  try {
    const available = ses.availableSpellCheckerLanguages;
    const languages = ['fr', 'en-US'].filter(l => available.includes(l));
    if (languages.length > 0) ses.setSpellCheckerLanguages(languages);
  } catch (err) {
    log.warn('Spell checker not configured', err);
  }

  ses.webRequest.onBeforeRequest((details, callback) => {
    videoAccelerator.handleUrl(details.url, settings.isVideoStreamTurboEnabled);
    if (details.webContentsId !== undefined) {
      const foundTab = findTabByViewContentsId(details.webContentsId);
      if (foundTab) {
        mediaGrabber.inspectRequest(foundTab.tab.id, details.url);
      }
    }

    // -1. Tracking-parameter cleaner: strip utm_*, fbclid, gclid… from page addresses
    // before the request leaves the browser.
    if (settings.isUrlCleanerEnabled && details.resourceType === 'mainFrame' && details.method === 'GET') {
      const cleaned = cleanTrackingParams(details.url);
      if (cleaned.removed > 0) {
        const owner = details.webContentsId !== undefined ? findTabByViewContentsId(details.webContentsId) : null;
        if (owner) noteTabCounter(owner.tab, 'trackingParamsRemoved', cleaned.removed);
        callback({ redirectURL: cleaned.url });
        return;
      }
    }

    // -0.5 Safe browsing: refuse hosts that are currently serving malware or phishing.
    if (settings.isSafeBrowsingEnabled && threatFeed.size > 0) {
      let threatHost = '';
      try { threatHost = new URL(details.url).hostname; } catch {}
      if (threatHost && threatFeed.has(threatHost) && !threatExceptions.has(threatHost)) {
        if (details.resourceType === 'mainFrame' && details.webContentsId !== undefined) {
          const owner = findTabByViewContentsId(details.webContentsId);
          if (owner) {
            owner.tab.threatWarning = { url: details.url, host: threatHost };
            owner.tab.url = details.url;
            owner.tab.title = threatHost;
            owner.tab.isLoading = false;
            try { owner.win.contentView.removeChildView(owner.tab.view); } catch {}
            bumpLifetimeStat('threatsBlocked');
            broadcastTabs();
          }
        }
        callback({ cancel: true });
        return;
      }
    }

    // 0. HTTPS upgrade: silently try the secure version of a site first (mainFrame
    // navigations only — sub-resource upgrades are riskier to fall back on safely).
    // If the secure version genuinely fails to load, did-fail-load below falls back
    // to the original http:// URL so this never leaves the user stuck on a blank page.
    if (settings.isHttpsUpgradeEnabled && details.resourceType === 'mainFrame' && details.url.startsWith('http://') && details.webContentsId !== undefined && !shouldSkipHttpsUpgrade(details.url)) {
      const httpsUrl = 'https://' + details.url.slice('http://'.length);
      httpsUpgradeAttempts.set(details.webContentsId, details.url);
      callback({ redirectURL: httpsUrl });
      return;
    }

    // 1. Focus mode: block sites the user has chosen to avoid, either manually turned on
    // or within their configured schedule.
    if (details.resourceType === 'mainFrame' && isFocusModeActiveNow() && focusMode.blockedSites.length > 0) {
      try {
        const domain = new URL(details.url).hostname.replace(/^www\./, '');
        const isBlocked = focusMode.blockedSites.some(site => domain === site || domain.endsWith('.' + site));
        if (isBlocked) {
          const found = findTabByViewContentsId(details.webContentsId ?? -1);
          if (found) {
            const blockedHtml = `
              <!DOCTYPE html><html><head><meta charset="utf-8"><title>Mode Focus</title>
              <style>body{background:#0A0A0A;color:#E5E5E5;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:0 24px;}h1{color:#818CF8;font-size:18px;margin:20px 0 8px;}p{color:#888;max-width:400px;line-height:1.6;font-size:13px;}</style>
              </head><body><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#818CF8" stroke-width="1.8"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <h1>Mode Focus actif</h1><p>${escapeHtml(domain)} est bloqué pendant cette session de concentration. Rendez-vous dans les paramètres du Mode Focus pour ajuster la liste ou le planning.</p></body></html>
            `;
            showBlockedPage(found.tab, details.url, blockedHtml);
          }
          callback({ cancel: true });
          return;
        }
      } catch (e) {}
    }

    // 2. Adult content filter (checked first, cheap hostname lookup)
    if (settings.isAdultFilterEnabled) {
      try {
        const urlObj = new URL(details.url);
        const domain = urlObj.hostname.replace(/^www\./, '');
        if (adultDomainBlocklist.has(domain)) {
          if (details.resourceType === 'mainFrame') {
            BrowserWindow.getAllWindows().forEach(win => {
              const tabs = (win as any).toraTabs;
              const tab = tabs?.find((t: Tab) => t.view.webContents.id === details.webContentsId);
              if (tab) {
                const blockedHtml = `
                  <!DOCTYPE html><html><head><meta charset="utf-8"><title>Contenu bloqué</title>
                  <style>body{background:#0A0A0A;color:#E5E5E5;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}h1{color:#F87171;}p{color:#A1A1A1;max-width:400px;line-height:1.5;}</style>
                  </head><body><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#F87171" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
                  <h1>Contenu bloqué</h1><p>Ce site (${escapeHtml(domain)}) a été bloqué par le filtre de contenu adulte de Tora.</p></body></html>
                `;
                showBlockedPage(tab, details.url, blockedHtml);
              }
            });
          }
          callback({ cancel: true });
          return;
        }
      } catch (e) {}
    }

    // 3. Ad/tracker blocking (delegated to the ghostery engine's own matcher) — unless the
    // person has explicitly disabled it just for the site they're currently on. Checked
    // against the PAGE's own domain (not the individual request's domain — an ad request to
    // doubleclick.net while browsing example.com should still honor example.com's setting).
    //
    // Video/audio SEGMENT requests (resourceType 'media') are exempted from matching. Actual
    // ads are virtually never delivered as this resource type (they're scripts, images, or
    // XHR calls that inject a separate ad video element) — but a video's own stream segments
    // fire this type continuously, every few seconds, for the whole duration of playback. On
    // ad-heavy streaming sites, running full list-matching against every one of those segment
    // requests was causing exactly the "stutters, has to rewind" pattern reported: enough
    // added latency per segment to starve the player's buffer. Skipping matching here removes
    // that bottleneck without weakening ad-blocking in practice.
    if (settings.isAdBlockEnabled && blocker && details.resourceType !== 'media') {
      let disabledHere = false;
      if (details.webContentsId !== undefined) {
        const found = findTabByViewContentsId(details.webContentsId);
        const pageDomain = found ? getRegistrableDomain(found.tab.url) : null;
        if (pageDomain) disabledHere = !!getDomainSettings(pageDomain).adBlockDisabled;
      }
      if (!disabledHere) {
        blocker.onBeforeRequest(details, callback);
        return;
      }
    }

    callback({});
  });

  // Global Privacy Control / Do Not Track: a standardized, low-cost signal telling sites
  // not to sell/share the user's data. Legally binding in some jurisdictions (e.g.
  // California under CCPA); at worst, honest sites simply ignore it.
  const topLevelTabFor = (webContentsId: number | undefined): Tab | null =>
    webContentsId === undefined ? null : (findTabByViewContentsId(webContentsId)?.tab ?? null);

  const cookiesAllowedFor = (topUrl: string): boolean => {
    const domain = getRegistrableDomain(topUrl);
    return !!domain && !!getDomainSettings(domain).thirdPartyCookiesAllowed;
  };

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    if (settings.isPrivacyHeadersEnabled) {
      headers['Sec-GPC'] = '1';
      headers['DNT'] = '1';
    }

    // Cross-site requests: never send cookies from other sites' trackers and share only the
    // origin (not the full address) in the Referer header.
    const tab = details.resourceType === 'mainFrame' ? null : topLevelTabFor(details.webContentsId);
    if (tab && /^https?:/i.test(tab.url) && isThirdPartyRequest(details.url, tab.url)) {
      if (settings.isThirdPartyCookieBlockEnabled && !cookiesAllowedFor(tab.url) && headers['Cookie']) {
        delete headers['Cookie'];
        noteTabCounter(tab, 'thirdPartyCookiesBlocked');
      }
    }
    if (settings.isReferrerTrimmingEnabled && headers['Referer']) {
      try {
        if (getSiteKey(new URL(headers['Referer']).hostname) !== getSiteKey(new URL(details.url).hostname)) {
          headers['Referer'] = trimReferrer(headers['Referer']);
        }
      } catch { /* leave the header as it is */ }
    }
    callback({ requestHeaders: headers });
  });

  // Third-party responses may not set cookies (the other half of third-party cookie blocking).
  ses.webRequest.onHeadersReceived((details, callback) => {
    if (settings.isThirdPartyCookieBlockEnabled && details.resourceType !== 'mainFrame' && details.responseHeaders) {
      const tab = topLevelTabFor(details.webContentsId);
      if (tab && /^https?:/i.test(tab.url) && isThirdPartyRequest(details.url, tab.url) && !cookiesAllowedFor(tab.url)) {
        const setCookieKeys = Object.keys(details.responseHeaders).filter(k => k.toLowerCase() === 'set-cookie');
        if (setCookieKeys.length > 0) {
          const headers = { ...details.responseHeaders };
          setCookieKeys.forEach(k => delete headers[k]);
          noteTabCounter(tab, 'thirdPartyCookiesBlocked');
          callback({ responseHeaders: headers });
          return;
        }
      }
    }
    callback({});
  });

  // Site permissions: default-deny anything not previously decided, and ask the person via
  // an in-app prompt rather than silently granting or silently blocking — mirrors what
  // Chrome/Firefox do, but routed through Tora's own UI instead of a native OS dialog.
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    let domain = '';
    try { domain = new URL(details.requestingUrl || webContents.getURL()).hostname.replace(/^www\./, ''); } catch { callback(false); return; }

    const stored = getDomainSettings(domain).permissions?.[permission];
    if (stored === 'granted') { callback(true); return; }
    if (stored === 'denied') { callback(false); return; }

    const found = findTabByViewContentsId(webContents.id);
    if (!found) { callback(false); return; }
    const pendingId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    pendingPermissionCallbacks.set(pendingId, { callback, tabId: found.tab.id, domain, permission });
    found.win.webContents.send('permission-prompt', { pendingId, tabId: found.tab.id, domain, permission });
  });

  ses.on('will-download', (event, item, webContents) => {
    const originTab = findTabByViewContentsId(webContents.id);
    // Unless the person asked to be prompted, save straight into their chosen folder
    // without ever overwriting an existing file.
    if (!settings.askDownloadLocation) {
      try { item.setSavePath(uniqueFilePath(getDownloadDir(), item.getFilename())); } catch (err) { log.warn('setSavePath failed', err); }
    }
    const dl: DownloadItem = {
      id: crypto.randomUUID(),
      filename: item.getFilename(),
      url: item.getURL(),
      state: item.getState(),
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      path: item.getSavePath(),
      favicon: originTab?.tab.favicon,
      source: 'browser',
      paused: false,
      canResume: false,
      private: isPrivate,
      startedAt: Date.now(),
    };
    downloads.unshift(dl);
    activeNativeDownloads.set(dl.id, item);
    broadcastDownloads();

    item.on('updated', (_event, state) => {
      dl.state = state;
      dl.paused = item.isPaused();
      dl.canResume = item.canResume();
      dl.path = item.getSavePath() || dl.path;
      dl.filename = item.getFilename() || dl.filename;
      dl.receivedBytes = item.getReceivedBytes();
      dl.totalBytes = item.getTotalBytes();
      broadcastDownloads();
    });
    item.on('done', (_event, state) => {
      dl.state = state;
      dl.paused = false;
      dl.canResume = false;
      dl.path = item.getSavePath() || dl.path;
      activeNativeDownloads.delete(dl.id);
      broadcastDownloads();
    });
  });
}

// Invalid certificates are refused unless the person explicitly chose to continue to that host.
app.on('certificate-error', (event, _webContents, url, _error, _certificate, callback) => {
  event.preventDefault();
  let host = '';
  try { host = new URL(url).hostname; } catch {}
  callback(!!host && certExceptions.has(host));
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  // Another Tora is already running and owns the data files: hand over to it and leave.
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const candidate = argv.slice(1).find(arg => /^https?:\/\//i.test(arg));
    if (candidate) createTab(win, sanitizeNavigationUrl(candidate).url);
  });
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  browsingSession = session.fromPartition('persist:tora-browsing');

  await loadData();
  await extensionManager.init(browsingSession);
  await extensionManager.loadEnabledExtensions();
  if (settings.isAdultFilterEnabled) fetchAdultBlocklist();

  try {
    blocker = await ElectronBlocker.fromLists(fetch, [
      'https://easylist.to/easylist/easylist.txt',
      'https://easylist.to/easylist/easyprivacy.txt',
    ], {}, {
      path: path.join(app.getPath('userData'), 'engine.bin'),
      read: fs.readFile,
      write: fs.writeFile,
    });

    blocker.on('request-blocked', (request) => {
      BrowserWindow.getAllWindows().forEach(win => {
        const tabs = (win as any).toraTabs;
        const tab = tabs?.find((t: Tab) => t.view.webContents.id === request.tabId);
        if (tab) {
          tab.blockedCount += 1; bumpLifetimeStat("adsBlocked");
          broadcastTabs();
        }
      });
    });
  } catch (err) {
    console.error('Failed to initialize adblocker', err);
  }

  // IMPORTANT: Electron only allows ONE `onBeforeRequest` listener per session — registering
  // a second one silently replaces the first. So the ad/tracker blocker (blocker.onBeforeRequest)
  // and the adult-content filter must be combined into a single handler here, instead of
  // calling blocker.enableBlockingInSession() (which registers its own separate listener)
  // AND our own onBeforeRequest (which would overwrite it).
  applySecureDns();
  threatFeed.load()
    .then(() => threatFeed.refreshIfStale())
    .catch(err => log.warn('Threat feed unavailable', err));
  setInterval(() => { threatFeed.refreshIfStale().catch(() => {}); }, 60 * 60 * 1000);

  configureSession(browsingSession, false);

  createNewWindow();

  initAutoUpdater();

  // Tab suspension: inactive tabs are parked on about:blank after a while to free up RAM
  // and CPU, similar to what Edge/Chrome do with "sleeping tabs". The active tab and any
  // internal Tora page are never suspended.
  const SUSPEND_AFTER_MS = 15 * 60 * 1000; // 15 minutes of inactivity
  setInterval(() => {
    for (const win of BrowserWindow.getAllWindows()) {
      const tabs = (win as any).toraTabs as Tab[] | undefined;
      const activeTabId = (win as any).toraActiveTabId;
      if (!tabs) continue;
      for (const tab of tabs) {
        if (tab.id === activeTabId) continue;
        if (tab.isSuspended || isInternalOrEmpty(tab.url)) continue;
        if (tab.isLoading || tab.isCrashed) continue;
        if (Date.now() - tab.lastActiveAt < SUSPEND_AFTER_MS) continue;

        log.info(`Suspending inactive tab: ${tab.url}`);
        tab.suspendedUrl = tab.url;
        tab.isSuspended = true;
        tab.view.webContents.loadURL('about:blank');
      }
      broadcastTabs();
    }
  }, 60 * 1000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Helper to get active window
function getWin(e: any): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender);
}

function getTab(e: any, id: string): Tab | null {
  const win = getWin(e);
  if (!win) return null;
  return (win as any).toraTabs?.find((t: Tab) => t.id === id);
}

// IPCs
ipcMain.on('create-tab', (e, rawUrl) => {
  const w = getWin(e);
  if (!w) return;
  const { valid, url } = sanitizeNavigationUrl(typeof rawUrl === 'string' ? rawUrl : '', settings.searchEngine);
  if (valid) createTab(w, url);
});
ipcMain.on('close-tab', (e, id) => { const w = getWin(e); if (w) closeTab(w, id); });
ipcMain.on('switch-tab', (e, id) => { const w = getWin(e); if (w) switchTab(w, id); });
ipcMain.on('toggle-tab-mute', (e, id: string) => {
  const tab = getTab(e, id);
  if (tab && !tab.view.webContents.isDestroyed()) {
    const isMuted = !tab.view.webContents.isAudioMuted();
    tab.view.webContents.setAudioMuted(isMuted);
    tab.isMuted = isMuted;
    broadcastTabs();
  }
});

ipcMain.on('reorder-tabs', (e, newOrderIds: string[]) => {
  const w = getWin(e);
  if (!w) return;
  const tabs = (w as any).toraTabs as Tab[];
  const byId = new Map(tabs.map(t => [t.id, t]));
  const reordered = newOrderIds.map(id => byId.get(id)).filter((t): t is Tab => !!t);
  // Safety net: if the id list didn't perfectly match (a tab closed mid-drag, etc.), keep
  // the original order rather than silently dropping tabs.
  if (reordered.length === tabs.length) {
    (w as any).toraTabs = pinnedFirst(reordered);
    scheduleSessionSave();
    broadcastTabs();
  }
});

ipcMain.on('set-tab-group-color', (e, id: string, color: string | null) => {
  const t = getTab(e, id);
  if (t) {
    t.groupColor = color || undefined;
    broadcastTabs();
  }
});

function showInternalPage(win: BrowserWindow | null, tab: Tab, url: string) {
  tab.isParked = true;
  tab.url = url;
  tab.title = url ? (INTERNAL_TITLES[url] || 'Tora') : 'New Tab';
  tab.isLoading = false;
  tab.favicon = undefined;
  if (win) {
    try { win.contentView.removeChildView(tab.view); } catch {}
  }
  if (!tab.view.webContents.isDestroyed()) {
    tab.view.webContents.stop();
    tab.view.webContents.loadURL('about:blank').catch(() => {});
  }
  scheduleSessionSave();
  broadcastTabs();
}

ipcMain.on('navigate', (e, id, rawUrl) => {
  const tab = getTab(e, id);
  if (!tab || typeof rawUrl !== 'string') return;
  tab.lastGestureTimestamp = Date.now();

  const { valid, url } = sanitizeNavigationUrl(rawUrl, settings.searchEngine);
  const win = getWin(e);
  if (!valid) {
    log.warn('Refused navigation to a disallowed address');
    return;
  }
  if (isInternalOrEmpty(url)) {
    showInternalPage(win, tab, url);
    return;
  }

  tab.isParked = false;
  tab.certError = undefined;
  tab.threatWarning = undefined;
  tab.showingErrorFor = undefined;
  tab.url = url;
  tab.view.webContents.loadURL(url).catch(() => {});
  const overlayReasons: Set<string> = win ? ((win as any).toraOverlayReasons || new Set()) : new Set();
  if (win && (win as any).toraActiveTabId === id && overlayReasons.size === 0) {
    win.contentView.addChildView(tab.view);
    applyContentBounds(win, tab);
  }
  broadcastTabs();
});

ipcMain.on('go-back', (e, id) => { const t = getTab(e, id); if (t && t.view.webContents.canGoBack()) { t.lastGestureTimestamp = Date.now(); t.view.webContents.goBack(); }});
ipcMain.on('go-forward', (e, id) => { const t = getTab(e, id); if (t && t.view.webContents.canGoForward()) { t.lastGestureTimestamp = Date.now(); t.view.webContents.goForward(); }});
ipcMain.on('reload', (e, id) => {
  const t = getTab(e, id);
  if (!t) return;
  t.lastGestureTimestamp = Date.now();
  if (t.certError || t.threatWarning) {
    const retryUrl = (t.certError || t.threatWarning)!.url;
    t.certError = undefined;
    t.threatWarning = undefined;
    t.url = retryUrl;
    const w = getWin(e);
    t.view.webContents.loadURL(retryUrl).catch(() => {});
    if (w) attachViewIfActive(w, t);
    broadcastTabs();
    return;
  }
  if (t.isCrashed) {
    // A crashed renderer can't just be told to reload — re-navigate to the last known URL.
    t.isCrashed = false;
    if (t.url && !isInternalUrl(t.url)) t.view.webContents.loadURL(t.url);
    broadcastTabs();
    return;
  }
  t.view.webContents.reload();
});

ipcMain.on('stop-load', (e, id) => {
  const t = getTab(e, id);
  if (t && !isInternalOrEmpty(t.url)) t.view.webContents.stop();
});

ipcMain.on('user-gesture-ping', (e) => {
  BrowserWindow.getAllWindows().forEach(win => {
    const tabs = (win as any).toraTabs;
    const tab = tabs?.find((t: Tab) => t.view.webContents.id === e.sender.id);
    if (tab) tab.lastGestureTimestamp = Date.now();
  });
});

ipcMain.on('scareware-blocked', (e) => {
  BrowserWindow.getAllWindows().forEach(win => {
    const tabs = (win as any).toraTabs;
    const tab = tabs?.find((t: Tab) => t.view.webContents.id === e.sender.id);
    if (tab && settings.isScarewareShieldEnabled) {
      tab.scarewareBlockedCount++; bumpLifetimeStat("scarewareBlocked");
      broadcastTabs();
    }
  });
});

ipcMain.on('cookie-banner-rejected', (e) => {
  log.info(`Cookie consent banner auto-rejected on tab webContents ${e.sender.id}`);
  bumpLifetimeStat('cookieBannersRejected');
});

// A direct, non-DRM media file the page itself linked to (never a blob: stream) — trigger
// a normal download through the same pipeline as any other download, including the
// Referer header many media hosts require to serve the file at all (hotlink protection).
ipcMain.on('download-media', (e, url: string) => {
  if (typeof url !== 'string' || !isSafeRemoteDownloadUrl(url)) {
    log.warn('Refused a media download from a disallowed address');
    return;
  }
  const found = findTabByViewContentsId(e.sender.id);
  const referrer = found?.tab.url || '';
  try {
    browsingSession.downloadURL(url, { headers: referrer ? { Referer: referrer } : {} } as any);
  } catch (err) {
    log.warn('download-media failed', err);
  }
});

ipcMain.on('toggle-reader-mode', (e) => {
  const w = getWin(e);
  const tab = w ? getActiveTab(w) : null;
  if (tab && !isInternalOrEmpty(tab.url)) tab.view.webContents.send('toggle-reader-mode');
});

ipcMain.on('reader-mode-unavailable', (e) => {
  const found = findTabByViewContentsId(e.sender.id);
  if (found) found.win.webContents.send('reader-mode-status', { available: false });
});

ipcMain.on('reader-mode-changed', (e, active: boolean) => {
  const found = findTabByViewContentsId(e.sender.id);
  if (found) {
    found.tab.isReaderMode = active;
    broadcastTabs();
  }
});

ipcMain.on('allow-popup-once', (e, id) => { const t = getTab(e, id); if (t) t.allowPopupUntil = Date.now() + 3000; });
ipcMain.on('force-navigate', (e, id, url) => {
  const t = getTab(e, id);
  if (!t || typeof url !== 'string') return;
  const { valid, url: safe } = sanitizeNavigationUrl(url);
  if (!valid || isInternalOrEmpty(safe)) return;
  t.lastGestureTimestamp = Date.now();
  t.view.webContents.loadURL(safe).catch(() => {});
});

// Settings & Toggles
ipcMain.on('get-settings-sync', (e) => { e.returnValue = settings; });

ipcMain.on('update-settings', (e, rawSettings) => {
  // Only known keys with the right type are accepted (the renderer is not trusted to send arbitrary data).
  const newSettings: Partial<ToraSettings> = {};
  if (rawSettings && typeof rawSettings === 'object') {
    for (const key of Object.keys(settings) as (keyof ToraSettings)[]) {
      if (!(key in rawSettings)) continue;
      const value = (rawSettings as any)[key];
      if (typeof value !== typeof (settings as any)[key]) continue;
      if (key === 'searchEngine' && !Object.prototype.hasOwnProperty.call(SEARCH_ENGINES, value)) continue;
      if (key === 'secureDns' && !['off', 'cloudflare', 'quad9', 'google'].includes(value)) continue;
      if (key === 'startupMode' && !['restore', 'newtab', 'homepage'].includes(value)) continue;
      if (key === 'homepageUrl' && (value.length > 2048 || (value !== '' && !sanitizeNavigationUrl(value).valid))) continue;
      if (key === 'downloadDirectory' && value !== '' && !path.isAbsolute(value)) continue;
      (newSettings as any)[key] = value;
    }
  }
  settings = { ...settings, ...newSettings };
  saveData('settings.json', settings);

  if ('isWebRtcProtectionEnabled' in newSettings) {
    for (const w of BrowserWindow.getAllWindows()) {
      ((w as any).toraTabs as Tab[] | undefined)?.forEach(t => applyWebRtcPolicy(t.view.webContents));
    }
  }
  if ('secureDns' in newSettings) applySecureDns();
  if ('isSafeBrowsingEnabled' in newSettings && settings.isSafeBrowsingEnabled) threatFeed.refreshIfStale().catch(() => {});

  // No need to call blocker.enableBlockingInSession/disableBlockingInSession here —
  // our single onBeforeRequest handler above already checks settings.isAdBlockEnabled
  // on every request, so toggling the setting takes effect immediately.
  if (settings.isAdultFilterEnabled && adultDomainBlocklist.size === 0) fetchAdultBlocklist();

  // Switching horizontal/vertical tab layout changes where the BrowserView should sit —
  // re-apply immediately rather than waiting for the next resize/tab-switch.
  if ('isVerticalTabsEnabled' in newSettings) {
    const win = getWin(e);
    const tab = win ? getActiveTab(win) : null;
    if (win && tab) applyContentBounds(win, tab);
  }

  broadcastTabs();
});

ipcMain.on('toggle-adblock', (e) => ipcMain.emit('update-settings', e, { isAdBlockEnabled: !settings.isAdBlockEnabled }));
ipcMain.on('toggle-adult-filter', (e, enabled) => ipcMain.emit('update-settings', e, { isAdultFilterEnabled: enabled }));

// App Level
ipcMain.on('create-new-window', () => createNewWindow());
ipcMain.on('quit-app', () => app.quit());
ipcMain.on('open-devtools', (e) => { const w = getWin(e); if (w) openDevToolsForActiveTab(w); });
ipcMain.on('zoom-in', (e) => { const w = getWin(e); if (w) applyZoom(w, ZOOM_STEP); });
ipcMain.on('zoom-out', (e) => { const w = getWin(e); if (w) applyZoom(w, -ZOOM_STEP); });
ipcMain.on('zoom-reset', (e) => { const w = getWin(e); if (w) applyZoom(w, 'reset'); });

ipcMain.on('find-in-page', (e, query: string) => {
  const w = getWin(e);
  const tab = w ? getActiveTab(w) : null;
  if (!tab || isInternalOrEmpty(tab.url)) return;
  if (!query) { tab.view.webContents.stopFindInPage('clearSelection'); return; }
  tab.view.webContents.findInPage(query);
});
ipcMain.on('find-in-page-next', (e, query: string, forward: boolean) => {
  const w = getWin(e);
  const tab = w ? getActiveTab(w) : null;
  if (!tab || isInternalOrEmpty(tab.url) || !query) return;
  tab.view.webContents.findInPage(query, { forward, findNext: true });
});
ipcMain.on('stop-find-in-page', (e) => {
  const w = getWin(e);
  const tab = w ? getActiveTab(w) : null;
  tab?.view.webContents.stopFindInPage('clearSelection');
});
ipcMain.on('minimize-window', (e) => { const w = getWin(e); w?.minimize(); });
ipcMain.on('maximize-window', (e) => { const w = getWin(e); if (!w) return; if (w.isMaximized()) w.unmaximize(); else w.maximize(); });
ipcMain.on('close-window', (e) => { const w = getWin(e); w?.close(); });

// Native limitation: BrowserView always renders above the entire host window's own
// web contents, regardless of CSS z-index. So whenever a dropdown/panel in the React UI
// needs to appear on top of the loaded page, we detach the BrowserView temporarily.
// Reason-based (not a plain boolean): several independent UI pieces (hamburger menu, find
// bar, and potentially more later) can each need the page retracted at different times —
// a single shared boolean would let one of them clobber the other's state when both toggle
// around the same time. Each window keeps a Set of active reasons; the view is only
// reattached once that set is fully empty.
ipcMain.on('set-overlay-active', async (e, reason: string, active: boolean) => {
  const win = getWin(e);
  if (!win) return;
  let reasons: Set<string> = (win as any).toraOverlayReasons || new Set();
  const wasInactive = reasons.size === 0;
  if (active) reasons.add(reason); else reasons.delete(reason);
  (win as any).toraOverlayReasons = reasons;

  const tabs = (win as any).toraTabs;
  const activeTabId = (win as any).toraActiveTabId;
  const tab = tabs?.find((t: Tab) => t.id === activeTabId);

  if (reasons.size > 0) {
    // Freeze a snapshot of the page BEFORE detaching it, so the React UI can show a
    // blurred freeze-frame behind the menu/panel instead of plain black. Captured while
    // the view is still attached and visible, then swapped in, so there's no black flash
    // in between — the page only visually changes once the blurred version is ready.
    if (wasInactive && tab && !isInternalOrEmpty(tab.url)) {
      try {
        const image = await tab.view.webContents.capturePage();
        win.webContents.send('page-snapshot', image.toDataURL());
      } catch (err) {
        log.warn('capturePage failed for overlay snapshot', err);
      }
    }
    if (tab && !isInternalOrEmpty(tab.url)) win.contentView.removeChildView(tab.view);
  } else {
    // IMPORTANT: always clear the frozen snapshot here, even if the tab that's active BY
    // THE TIME this fires is an internal tora:// page (e.g. the person clicked a menu item
    // that both switched tabs AND closed the menu in the same tick — the switch can land
    // first). Without this, the blurred freeze-frame from whatever page was showing when
    // the menu opened stayed stuck on screen indefinitely over the new internal page.
    win.webContents.send('page-snapshot', null);
    if (tab && !isInternalOrEmpty(tab.url)) {
      win.contentView.addChildView(tab.view);
      applyContentBounds(win, tab);
    }
  }
});

// Data Management
ipcMain.handle('get-shortcuts', () => shortcuts);
ipcMain.handle('save-shortcut', (e, title, url) => {
  shortcuts.push({ id: Date.now().toString(), title, url });
  saveData('shortcuts.json', shortcuts);
  return shortcuts;
});
ipcMain.handle('delete-shortcut', (e, id) => {
  shortcuts = shortcuts.filter(s => s.id !== id);
  saveData('shortcuts.json', shortcuts);
  return shortcuts;
});

ipcMain.handle('get-history', () => history);
ipcMain.handle('clear-history', () => { history = []; saveData('history.json', history); });
ipcMain.handle('delete-history-entry', (e, id) => {
  history = history.filter(h => h.id !== id);
  saveData('history.json', history);
});

ipcMain.handle('get-downloads', async () => {
  await Promise.all(downloads.map(async d => {
    if (d.state !== 'completed' || !d.path) { d.missing = false; return; }
    try { await fs.access(d.path); d.missing = false; } catch { d.missing = true; }
  }));
  return downloads;
});

function findDownload(id: unknown): DownloadItem | undefined {
  return typeof id === 'string' ? downloads.find(d => d.id === id) : undefined;
}

ipcMain.on('pause-download', (_e, id) => {
  const item = activeNativeDownloads.get(id);
  if (item && !item.isPaused()) { item.pause(); const dl = findDownload(id); if (dl) { dl.paused = true; broadcastDownloads(); } }
});
ipcMain.on('resume-download', (_e, id) => {
  const item = activeNativeDownloads.get(id);
  if (item && item.canResume()) { item.resume(); const dl = findDownload(id); if (dl) { dl.paused = false; broadcastDownloads(); } }
});
ipcMain.on('cancel-download', (_e, id) => {
  const dl = findDownload(id);
  if (!dl) return;
  activeNativeDownloads.get(id)?.cancel();
  activeVideoDownloads.get(id)?.cancel();
  if (dl.state === 'progressing') dl.state = 'cancelled';
  dl.paused = false;
  broadcastDownloads();
});
ipcMain.on('retry-download', (_e, id) => {
  const dl = findDownload(id);
  if (!dl || dl.source !== 'browser' || !isSafeRemoteDownloadUrl(dl.url)) return;
  downloads = downloads.filter(d => d.id !== id);
  broadcastDownloads();
  try { browsingSession.downloadURL(dl.url); } catch (err) { log.warn('retry-download failed', err); }
});
ipcMain.on('remove-download', (_e, id) => {
  activeNativeDownloads.get(id)?.cancel();
  activeVideoDownloads.get(id)?.cancel();
  downloads = downloads.filter(d => d.id !== id);
  broadcastDownloads();
});
ipcMain.on('clear-downloads', () => {
  downloads = downloads.filter(d => d.state === 'progressing');
  broadcastDownloads();
});
// Only files Tora itself downloaded (known list, inside a downloads location) can be opened
// or revealed — never an arbitrary path sent by the renderer.
function resolveKnownDownloadPath(pathStr: unknown): string | null {
  if (typeof pathStr !== 'string' || !pathStr) return null;
  const known = downloads.some(d => d.path && path.resolve(d.path) === path.resolve(pathStr));
  return known ? path.resolve(pathStr) : null;
}

const DANGEROUS_EXTENSIONS = new Set(['.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.ps1', '.psm1', '.hta', '.cpl', '.jar', '.lnk', '.reg', '.dll']);

ipcMain.on('show-item-in-folder', (e, pathStr) => {
  const resolved = resolveKnownDownloadPath(pathStr);
  if (resolved) shell.showItemInFolder(resolved);
});
ipcMain.on('open-item', async (e, pathStr) => {
  const resolved = resolveKnownDownloadPath(pathStr);
  if (!resolved) return;
  if (DANGEROUS_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    const win = getWin(e);
    const options = {
      type: 'warning' as const,
      buttons: ['Annuler', 'Afficher dans le dossier', 'Ouvrir quand même'],
      defaultId: 0,
      cancelId: 0,
      title: 'Fichier potentiellement dangereux',
      message: `${path.basename(resolved)} est un fichier exécutable.`,
      detail: "Ouvrir un programme téléchargé peut endommager votre ordinateur ou voler vos données. Ne l'ouvrez que si vous faites entièrement confiance à sa source.",
    };
    const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    if (response === 1) shell.showItemInFolder(resolved);
    if (response !== 2) return;
  }
  const error = await shell.openPath(resolved);
  if (error) log.warn('open-item failed:', error);
});

// ===== Bookmarks =====
ipcMain.handle('get-bookmarks', () => bookmarks);
ipcMain.handle('get-lifetime-stats', () => lifetimeStats);

// ===== Site permissions & per-domain settings =====
ipcMain.on('respond-permission', (e, pendingId: string, granted: boolean, remember: boolean) => {
  const pending = pendingPermissionCallbacks.get(pendingId);
  if (!pending) return;
  pendingPermissionCallbacks.delete(pendingId);
  if (remember) {
    const ds = perDomainSettings[pending.domain] || {};
    ds.permissions = { ...(ds.permissions || {}), [pending.permission]: granted ? 'granted' : 'denied' };
    perDomainSettings[pending.domain] = ds;
    saveDomainSettings();
  }
  pending.callback(granted);
});

ipcMain.on('remember-permission', (e, domain: string, permission: string, decision: 'granted' | 'denied') => {
  const ds = perDomainSettings[domain] || {};
  ds.permissions = { ...(ds.permissions || {}), [permission]: decision };
  perDomainSettings[domain] = ds;
  saveDomainSettings();
});

ipcMain.handle('get-domain-settings', (e, domain: string) => getDomainSettings(domain));

ipcMain.handle('set-domain-setting', (e, domain: string, key: 'adBlockDisabled' | 'darkModeForced' | 'thirdPartyCookiesAllowed', value: boolean) => {
  if (typeof domain !== 'string' || !['adBlockDisabled', 'darkModeForced', 'thirdPartyCookiesAllowed'].includes(key)) return {};
  const ds = perDomainSettings[domain] || {};
  ds[key] = value;
  perDomainSettings[domain] = ds;
  saveDomainSettings();
  const win = getWin(e);
  const tab = win ? getActiveTab(win) : null;
  if (tab && key === 'darkModeForced' && !isInternalOrEmpty(tab.url)) {
    applyForcedDarkMode(tab, value);
  }
  return ds;
});

ipcMain.handle('clear-domain-permissions', (e, domain: string) => {
  if (perDomainSettings[domain]) {
    delete perDomainSettings[domain].permissions;
    saveDomainSettings();
  }
});

// ===== Focus mode =====
ipcMain.handle('get-focus-mode', () => ({ ...focusMode, isActiveNow: isFocusModeActiveNow() }));

ipcMain.handle('update-focus-mode', (e, partial: Partial<FocusModeState>) => {
  focusMode = {
    ...focusMode,
    ...partial,
    schedule: { ...focusMode.schedule, ...(partial.schedule || {}) },
  };
  saveData('focus-mode.json', focusMode);
  return { ...focusMode, isActiveNow: isFocusModeActiveNow() };
});

ipcMain.handle('add-focus-blocked-site', (e, site: string) => {
  const clean = site.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (clean && !focusMode.blockedSites.includes(clean)) {
    focusMode.blockedSites.push(clean);
    saveData('focus-mode.json', focusMode);
  }
  return focusMode.blockedSites;
});

ipcMain.handle('remove-focus-blocked-site', (e, site: string) => {
  focusMode.blockedSites = focusMode.blockedSites.filter(s => s !== site);
  saveData('focus-mode.json', focusMode);
  return focusMode.blockedSites;
});

// ===== Import from Chrome =====
ipcMain.handle('import-chrome-bookmarks', async () => {
  const result = await importChromeBookmarks();
  if (!result.ok || !result.bookmarks) return result;

  let addedCount = 0;
  const existingUrls = new Set(bookmarks.map(b => b.url));
  for (const b of result.bookmarks) {
    if (existingUrls.has(b.url)) continue;
    bookmarks.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      url: b.url,
      title: b.title,
      createdAt: Date.now(),
    });
    existingUrls.add(b.url);
    addedCount++;
  }
  saveData('bookmarks.json', bookmarks);
  broadcastTabs();
  return { ok: true, imported: addedCount, skipped: result.bookmarks.length - addedCount };
});

ipcMain.handle('import-chrome-passwords', async () => {
  const result = await importChromePasswords();
  if (!result.ok || !result.credentials) return result;

  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'Le chiffrement système est indisponible — import annulé.' };
  }

  let addedCount = 0, updatedCount = 0;
  for (const c of result.credentials) {
    const encryptedPassword = safeStorage.encryptString(c.password).toString('base64');
    const existing = credentials.find(x => x.domain === c.domain && x.username === c.username);
    if (existing) {
      existing.encryptedPassword = encryptedPassword;
      existing.lastUsedAt = Date.now();
      updatedCount++;
    } else {
      credentials.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        domain: c.domain,
        username: c.username,
        encryptedPassword,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      });
      addedCount++;
    }
  }
  saveData('credentials.json', credentials);
  log.info(`Chrome password import: ${addedCount} added, ${updatedCount} updated`);
  return { ok: true, imported: addedCount, updated: updatedCount };
});

ipcMain.handle('toggle-bookmark', (e, id: string) => {
  const tab = getTab(e, id);
  if (!tab || isInternalOrEmpty(tab.url)) return bookmarks;
  const existing = bookmarks.find(b => b.url === tab.url);
  if (existing) {
    bookmarks = bookmarks.filter(b => b.url !== tab.url);
  } else {
    bookmarks.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      url: tab.url,
      title: tab.title || tab.url,
      favicon: tab.favicon,
      createdAt: Date.now(),
    });
  }
  saveData('bookmarks.json', bookmarks);
  broadcastTabs();
  return bookmarks;
});

ipcMain.handle('delete-bookmark', (e, id: string) => {
  bookmarks = bookmarks.filter(b => b.id !== id);
  saveData('bookmarks.json', bookmarks);
  broadcastTabs();
  return bookmarks;
});

// ===== Page capture & QR code =====
ipcMain.handle('capture-page', async (e, mode: 'save' | 'clipboard') => {
  const win = getWin(e);
  const tab = win ? getActiveTab(win) : null;
  if (!tab || isInternalOrEmpty(tab.url)) return { ok: false, error: 'Rien à capturer sur cette page.' };

  try {
    const image = await tab.view.webContents.capturePage();
    if (mode === 'clipboard') {
      clipboard.writeImage(image);
      return { ok: true };
    }
    if (!win) return { ok: false, error: 'Fenêtre introuvable.' };
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Enregistrer la capture',
      defaultPath: `tora-capture-${new Date().toISOString().slice(0, 10)}.png`,
      filters: [{ name: 'Image PNG', extensions: ['png'] }],
    });
    if (canceled || !filePath) return { ok: false, error: 'Annulé.' };
    await fs.writeFile(filePath, image.toPNG());
    return { ok: true, path: filePath };
  } catch (err) {
    log.warn('capture-page failed', err);
    return { ok: false, error: 'La capture a échoué.' };
  }
});

ipcMain.handle('get-page-qrcode', async (e) => {
  const win = getWin(e);
  const tab = win ? getActiveTab(win) : null;
  if (!tab || isInternalOrEmpty(tab.url)) return { ok: false, error: 'Aucune page active.' };
  try {
    const QRCode = (await import('qrcode')).default;
    const dataUrl = await QRCode.toDataURL(tab.url, { margin: 1, width: 240, color: { dark: '#000000', light: '#ffffff' } });
    return { ok: true, dataUrl, url: tab.url };
  } catch (err) {
    return { ok: false, error: 'Génération du QR code impossible.' };
  }
});

// ===== Fake Persona & PiP handlers =====
ipcMain.handle('generate-fake-persona', () => {
  return generateFakePersona();
});

ipcMain.handle('trigger-pip', (e) => {
  const win = getWin(e);
  const tab = win ? getActiveTab(win) : null;
  if (!tab || isInternalOrEmpty(tab.url)) return { ok: false, error: 'Aucune vidéo active sur cet onglet.' };
  pipManager.togglePip(tab.id, tab.url, win);
  return { ok: true };
});

// ===== 1-Click Video & Media Downloader (Multi-Tier Bulletproof Fallback Cascade) =====
ipcMain.handle('download-video', async (e, videoUrl?: string) => {
  const win = getWin(e);
  const tab = win ? getActiveTab(win) : null;
  const targetUrl = videoUrl || (tab ? tab.url : '');
  if (!targetUrl || isInternalOrEmpty(targetUrl)) {
    return { ok: false, message: 'Aucune vidéo ou page active à télécharger.' };
  }
  if (!isSafeRemoteDownloadUrl(targetUrl)) {
    return { ok: false, message: "Cette adresse ne peut pas être téléchargée (seules les adresses web publiques sont acceptées)." };
  }

  try {
    const sniffedMedia = tab ? mediaGrabber.getMediaForTab(tab.id) : [];
    const mediaTarget = sniffedMedia.length > 0 ? sniffedMedia[sniffedMedia.length - 1].url : targetUrl;

    const downloadId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const domainName = getRegistrableDomain(targetUrl) || 'media';
    const savePath = uniqueFilePath(getDownloadDir(), `Tora-Video-${domainName}-${Date.now().toString(36).slice(-4)}.mp4`);
    const filename = path.basename(savePath);

    // TIER 1: Try MultiSegment parallel HTTP downloader
    const segments = settings.isAcceleratedDownloadEnabled ? 8 : 1;
    const downloader = new MultiSegmentDownloader(downloadId, mediaTarget, savePath, segments);

    const downloadItem: DownloadItem = {
      id: downloadId,
      url: mediaTarget,
      filename,
      path: savePath,
      receivedBytes: 0,
      totalBytes: 0,
      state: 'progressing',
      speedBytesPerSec: 0,
      source: 'video',
      startedAt: Date.now(),
    };
    downloads.unshift(downloadItem);
    activeVideoDownloads.set(downloadId, downloader);
    broadcastDownloads();

    downloader.on('progress', (prog: DownloadProgress) => {
      const idx = downloads.findIndex(d => d.id === downloadId);
      if (idx !== -1) {
        downloads[idx].receivedBytes = prog.receivedBytes;
        downloads[idx].totalBytes = prog.totalBytes;
        downloads[idx].state = prog.state;
        downloads[idx].speedBytesPerSec = prog.speedBytesPerSec;
        broadcastDownloads();
      }
    });

    // Start download with automatic TIER 2 & TIER 3 fallback handling
    downloader.start().then(async (success) => {
      activeVideoDownloads.delete(downloadId);
      if (!success && downloader.state === 'cancelled') {
        const cancelled = downloads.find(d => d.id === downloadId);
        if (cancelled) { cancelled.state = 'cancelled'; broadcastDownloads(); }
        return;
      }
      if (!success) {
        const item = downloads.find(d => d.id === downloadId);
        if (item && item.state !== 'completed') {
          log.info(`MultiSegmentDownloader fallback triggered for ${targetUrl}`);
          // TIER 2: Fallback to yt-dlp binary if available on system
          const { execFile } = await import('child_process');
          if (!isSafeRemoteDownloadUrl(targetUrl)) {
            item.state = 'interrupted';
            broadcastDownloads();
            return;
          }
          // execFile (no shell) so the page URL can never be interpreted as shell syntax.
          execFile('yt-dlp', ['-f', 'b[ext=mp4]/bestvideo+bestaudio/best', '-o', savePath, '--', targetUrl], async () => {
            const idx = downloads.findIndex(d => d.id === downloadId);
            if (idx !== -1) {
              try {
                const stat = await fs.stat(savePath);
                if (stat.size > 0) {
                  downloads[idx].state = 'completed';
                  downloads[idx].receivedBytes = stat.size;
                  downloads[idx].totalBytes = stat.size;
                } else {
                  downloads[idx].state = 'interrupted';
                }
              } catch {
                downloads[idx].state = 'interrupted';
              }
              broadcastDownloads();
            }
          });
        }
      }
    }).catch((err) => {
      log.warn('Video download error:', err);
    });

    return { ok: true, message: `Téléchargement lancé : ${filename}` };
  } catch (err) {
    log.error('download-video failed:', err);
    return { ok: false, message: 'Impossible de lancer le téléchargement de la vidéo.' };
  }
});




// ===== Updates =====
// Updates are fetched by electron-updater from the release channel configured in package.json
// ("build.publish"). Without a channel, or when running from source, the feature reports why it
// is unavailable instead of failing silently.
interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error' | 'disabled';
  version?: string;
  percent?: number;
  message?: string;
}
let updateStatus: UpdateStatus = { state: 'idle' };
let updaterInstance: any = null;

function setUpdateStatus(next: UpdateStatus) {
  updateStatus = next;
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send('update-status', updateStatus));
}

function initAutoUpdater() {
  if (!app.isPackaged) {
    setUpdateStatus({ state: 'disabled', message: 'Les mises à jour automatiques ne sont disponibles que dans la version installée de Tora.' });
    return;
  }
  try {
    const { autoUpdater } = require('electron-updater');
    updaterInstance = autoUpdater;
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => setUpdateStatus({ state: 'checking' }));
    autoUpdater.on('update-available', (info: any) => setUpdateStatus({ state: 'available', version: info?.version }));
    autoUpdater.on('update-not-available', () => setUpdateStatus({ state: 'none' }));
    autoUpdater.on('download-progress', (p: any) => setUpdateStatus({ state: 'downloading', version: updateStatus.version, percent: Math.round(p?.percent ?? 0) }));
    autoUpdater.on('update-downloaded', (info: any) => setUpdateStatus({ state: 'ready', version: info?.version }));
    autoUpdater.on('error', (err: Error) => {
      log.info('Update check failed:', err?.message);
      const noChannel = /app-update\.yml|No published versions|ENOENT/i.test(err?.message || '');
      setUpdateStatus(noChannel
        ? { state: 'disabled', message: "Aucun canal de mise à jour n'est configuré pour cette version." }
        : { state: 'error', message: "La recherche de mise à jour a échoué. Vérifiez votre connexion." });
    });
    autoUpdater.checkForUpdates().catch(() => { /* reported through the 'error' event */ });
    setInterval(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 6 * 60 * 60 * 1000);
  } catch (err) {
    log.info('electron-updater not active:', err);
    setUpdateStatus({ state: 'disabled', message: "Le module de mise à jour n'est pas disponible." });
  }
}

ipcMain.on('request-tab-state', () => broadcastTabs());
ipcMain.handle('get-app-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: `${process.platform} ${process.arch}`,
  userDataPath: app.getPath('userData'),
  logPath: path.dirname(log.transports.file.getFile().path),
  update: updateStatus,
}));
ipcMain.on('open-data-folder', () => { shell.openPath(app.getPath('userData')); });
ipcMain.on('open-log-folder', () => { shell.openPath(path.dirname(log.transports.file.getFile().path)); });
ipcMain.on('check-for-updates', () => {
  if (updaterInstance) updaterInstance.checkForUpdates().catch(() => {});
  else setUpdateStatus(updateStatus.state === 'idle' ? { state: 'disabled', message: 'Mises à jour indisponibles.' } : updateStatus);
});
ipcMain.on('install-update', () => { if (updateStatus.state === 'ready' && updaterInstance) updaterInstance.quitAndInstall(); });


// ===== Tab menu actions =====
// Pinned tabs always stay grouped at the start of the strip (stable order inside each group).
function pinnedFirst(tabs: Tab[]): Tab[] {
  return [...tabs.filter(t => t.isPinned), ...tabs.filter(t => !t.isPinned)];
}

ipcMain.on('pin-tab', (e, id: string, pinned: boolean) => {
  const w = getWin(e);
  const t = getTab(e, id);
  if (!w || !t || typeof pinned !== 'boolean') return;
  t.isPinned = pinned;
  (w as any).toraTabs = pinnedFirst((w as any).toraTabs as Tab[]);
  scheduleSessionSave();
  broadcastTabs();
});

ipcMain.on('duplicate-tab', (e, id: string) => {
  const w = getWin(e);
  const t = getTab(e, id);
  if (!w || !t || !t.url || isInternalUrl(t.url)) return;
  createTab(w, t.certError?.url || t.threatWarning?.url || t.url, t.containerId);
});

ipcMain.on('close-other-tabs', (e, id: string) => {
  const w = getWin(e);
  if (!w || !getTab(e, id)) return;
  const others = ((w as any).toraTabs as Tab[]).filter(t => t.id !== id && !t.isPinned);
  switchTab(w, id);
  others.forEach(t => closeTab(w, t.id));
});

ipcMain.on('close-tabs-to-right', (e, id: string) => {
  const w = getWin(e);
  if (!w) return;
  const tabs = (w as any).toraTabs as Tab[];
  const index = tabs.findIndex(t => t.id === id);
  if (index === -1) return;
  tabs.slice(index + 1).filter(t => !t.isPinned).forEach(t => closeTab(w, t.id));
});

// ===== Containers =====
ipcMain.handle('get-containers', () => containers);

ipcMain.handle('save-container', (_e, raw: { id?: string; name: string; color: string }) => {
  const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, 30) : '';
  const color = typeof raw?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : '';
  if (!name || !color) return containers;
  const existing = raw.id ? containers.find(c => c.id === raw.id) : undefined;
  if (existing) {
    existing.name = name;
    existing.color = color;
  } else if (containers.length < MAX_CONTAINERS) {
    containers.push({ id: crypto.randomUUID().slice(0, 8), name, color });
  }
  saveData('containers.json', containers);
  broadcastTabs();
  return containers;
});

ipcMain.handle('delete-container', async (_e, id: string) => {
  const target = containers.find(c => c.id === id);
  if (!target) return containers;
  // Close every tab that lives in this container, then wipe its storage for good.
  for (const win of BrowserWindow.getAllWindows()) {
    const tabs = ((win as any).toraTabs || []) as Tab[];
    for (const t of tabs.filter(t => t.containerId === id)) closeTab(win, t.id);
  }
  containers = containers.filter(c => c.id !== id);
  configuredContainerSessions.delete(id);
  saveData('containers.json', containers);
  try {
    const ses = session.fromPartition(`persist:container-${id}`);
    await ses.clearStorageData();
    await ses.clearCache();
  } catch (err) {
    log.warn('Container storage not fully cleared', err);
  }
  broadcastTabs();
  return containers;
});

ipcMain.on('create-container-tab', (e, id: string, rawUrl?: string) => {
  const w = getWin(e);
  if (!w || !containers.some(c => c.id === id)) return;
  const { valid, url } = sanitizeNavigationUrl(typeof rawUrl === 'string' ? rawUrl : '', settings.searchEngine);
  if (valid) createTab(w, url, id);
});

// ===== Page tools, private window, certificates, suggestions, data clearing =====
ipcMain.on('reopen-closed-tab', (e) => { const w = getWin(e); if (w) reopenClosedTab(w); });
ipcMain.on('create-private-window', () => createNewWindow({ isPrivate: true }));
ipcMain.on('print-page', (e) => { const w = getWin(e); if (w) printActiveTab(w); });
ipcMain.on('save-page-pdf', (e) => { const w = getWin(e); if (w) savePagePdf(w); });
ipcMain.on('save-page-html', (e) => { const w = getWin(e); if (w) savePageHtml(w); });
ipcMain.on('view-source', (e) => { const w = getWin(e); if (w) openViewSource(w); });

ipcMain.on('cert-proceed', (e, id) => {
  const t = getTab(e, id);
  const w = getWin(e);
  if (!t || !w || !t.certError) return;
  const { url, host } = t.certError;
  if (host) certExceptions.add(host);
  t.certError = undefined;
  t.url = url;
  t.isLoading = true;
  t.view.webContents.loadURL(url).catch(() => {});
  attachViewIfActive(w, t);
  broadcastTabs();
});

ipcMain.on('cert-go-back', (e, id) => {
  const t = getTab(e, id);
  const w = getWin(e);
  if (!t || !w || !t.certError) return;
  t.certError = undefined;
  if (!t.view.webContents.isDestroyed() && t.view.webContents.canGoBack()) {
    t.view.webContents.goBack();
    attachViewIfActive(w, t);
    broadcastTabs();
  } else {
    showInternalPage(w, t, '');
  }
});

ipcMain.on('threat-proceed', (e, id) => {
  const t = getTab(e, id);
  const w = getWin(e);
  if (!t || !w || !t.threatWarning) return;
  const { url, host } = t.threatWarning;
  threatExceptions.add(host);
  t.threatWarning = undefined;
  t.url = url;
  t.isLoading = true;
  t.view.webContents.loadURL(url).catch(() => {});
  attachViewIfActive(w, t);
  broadcastTabs();
});

ipcMain.on('threat-go-back', (e, id) => {
  const t = getTab(e, id);
  const w = getWin(e);
  if (!t || !w || !t.threatWarning) return;
  t.threatWarning = undefined;
  if (!t.view.webContents.isDestroyed() && t.view.webContents.canGoBack()) {
    t.view.webContents.goBack();
    attachViewIfActive(w, t);
    broadcastTabs();
  } else {
    showInternalPage(w, t, '');
  }
});

ipcMain.handle('get-suggestions', (_e, rawQuery): Suggestion[] => {
  const q = typeof rawQuery === 'string' ? rawQuery.trim().slice(0, 200) : '';
  if (!q) return [];
  const lower = q.toLowerCase();
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const key = (u: string) => u.replace(/\/+$/, '').toLowerCase();

  const nav = sanitizeNavigationUrl(q, settings.searchEngine);
  if (nav.valid && nav.url) {
    const isSearch = nav.url.startsWith(SEARCH_ENGINES[settings.searchEngine] ?? SEARCH_ENGINES.duckduckgo);
    out.push(isSearch
      ? { kind: 'search', title: `Rechercher « ${q} » avec ${SEARCH_ENGINE_LABELS[settings.searchEngine] || 'le moteur de recherche'}`, url: nav.url }
      : { kind: 'url', title: nav.url, url: nav.url });
    seen.add(key(nav.url));
  }

  const matches = (title: string | undefined, url: string) =>
    url.toLowerCase().includes(lower) || (title ? title.toLowerCase().includes(lower) : false);
  const rank = (url: string, title: string | undefined) => {
    const host = (getRegistrableDomain(url) || '').toLowerCase();
    return host.startsWith(lower) ? 0 : (title || '').toLowerCase().startsWith(lower) ? 1 : 2;
  };

  const fromBookmarks = bookmarks
    .filter(b => /^https?:/i.test(b.url) && matches(b.title, b.url))
    .sort((a, b) => rank(a.url, a.title) - rank(b.url, b.title))
    .slice(0, 3);
  for (const b of fromBookmarks) {
    if (seen.has(key(b.url))) continue;
    seen.add(key(b.url));
    out.push({ kind: 'bookmark', title: b.title || b.url, url: b.url });
  }

  const fromHistory = history
    .filter(h => /^https?:/i.test(h.url) && matches(h.title, h.url))
    .sort((a, b) => rank(a.url, a.title) - rank(b.url, b.title));
  for (const h of fromHistory) {
    if (out.length >= 8) break;
    if (seen.has(key(h.url))) continue;
    seen.add(key(h.url));
    out.push({ kind: 'history', title: h.title || h.url, url: h.url });
  }
  return out;
});

ipcMain.handle('clear-browsing-data', async (_e, raw: ClearDataOptions) => {
  const ranges: Record<string, number> = { hour: 3600e3, day: 86400e3, week: 604800e3, all: Infinity };
  if (!raw || typeof raw !== 'object' || !(raw.range in ranges)) return { ok: false, cleared: [] };
  const since = raw.range === 'all' ? Infinity : Date.now() - ranges[raw.range];
  const cleared: string[] = [];

  if (raw.history === true) {
    history = history.filter(h => since !== Infinity && h.timestamp < since);
    await saveData('history.json', history);
    cleared.push('history');
  }
  if (raw.downloads === true) {
    downloads = downloads.filter(d => d.state === 'progressing' || (since !== Infinity && (d.startedAt ?? 0) < since));
    broadcastDownloads();
    cleared.push('downloads');
  }
  if (raw.cookies === true) {
    // Chromium cannot clear site data by time range: it is always removed entirely.
    const storages = ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'filesystem'] as const;
    await browsingSession.clearStorageData({ storages: [...storages] });
    for (const c of containers) {
      await session.fromPartition(`persist:container-${c.id}`).clearStorageData({ storages: [...storages] });
    }
    cleared.push('cookies');
  }
  if (raw.cache === true) {
    await browsingSession.clearCache();
    for (const c of containers) await session.fromPartition(`persist:container-${c.id}`).clearCache();
    cleared.push('cache');
  }
  if (raw.permissions === true) {
    for (const domain of Object.keys(perDomainSettings)) delete perDomainSettings[domain].permissions;
    saveDomainSettings();
    cleared.push('permissions');
  }
  return { ok: true, cleared };
});

ipcMain.handle('choose-download-directory', async (e) => {
  const win = getWin(e);
  if (!win) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Choisir le dossier de téléchargement',
    defaultPath: getDownloadDir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  return canceled || filePaths.length === 0 ? null : filePaths[0];
});

// ===== Encrypted password vault export/import =====
// safeStorage's key lives in the OS credential store — if that's ever lost (Windows
// reinstall, profile reset, moving to a new machine), every saved password becomes
// permanently unrecoverable. This gives an explicit, user-initiated backup: a JSON file
// encrypted with AES-256-GCM under a key derived (via scrypt) from a master password the
// user chooses — independent of safeStorage, so it's portable and restorable anywhere.
ipcMain.handle('export-credentials', async (e, masterPassword: string) => {
  if (!masterPassword || masterPassword.length < 8) {
    return { ok: false, error: 'Le mot de passe maître doit contenir au moins 8 caractères.' };
  }
  const win = getWin(e);
  if (!win) return { ok: false, error: 'Fenêtre introuvable.' };

  const plainCredentials = credentials.map(c => {
    let password = '';
    try {
      if (safeStorage.isEncryptionAvailable()) {
        password = safeStorage.decryptString(Buffer.from(c.encryptedPassword, 'base64'));
      }
    } catch (err) {}
    return { domain: c.domain, username: c.username, password };
  });

  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(masterPassword, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(plainCredentials), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const envelope = {
    format: 'tora-vault-v1',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Exporter le coffre de mots de passe',
    defaultPath: `tora-coffre-${new Date().toISOString().slice(0, 10)}.toravault`,
    filters: [{ name: 'Coffre Tora chiffré', extensions: ['toravault'] }],
  });
  if (canceled || !filePath) return { ok: false, error: 'Export annulé.' };

  await fs.writeFile(filePath, JSON.stringify(envelope), 'utf8');
  log.info(`Exported ${plainCredentials.length} credential(s) to ${filePath}`);
  return { ok: true, count: plainCredentials.length };
});

ipcMain.handle('import-credentials', async (e, masterPassword: string) => {
  const win = getWin(e);
  if (!win) return { ok: false, error: 'Fenêtre introuvable.' };

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Importer un coffre de mots de passe Tora',
    filters: [{ name: 'Coffre Tora chiffré', extensions: ['toravault'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return { ok: false, error: 'Import annulé.' };

  try {
    const raw = await fs.readFile(filePaths[0], 'utf8');
    const envelope = JSON.parse(raw);
    if (envelope.format !== 'tora-vault-v1') return { ok: false, error: 'Fichier de coffre invalide.' };

    const salt = Buffer.from(envelope.salt, 'base64');
    const key = crypto.scryptSync(masterPassword, salt, 32);
    const iv = Buffer.from(envelope.iv, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');

    const imported: { domain: string; username: string; password: string }[] = JSON.parse(plaintext);
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'Le chiffrement système est indisponible.' };

    let addedCount = 0, updatedCount = 0;
    for (const item of imported) {
      const encryptedPassword = safeStorage.encryptString(item.password).toString('base64');
      const existing = credentials.find(c => c.domain === item.domain && c.username === item.username);
      if (existing) {
        existing.encryptedPassword = encryptedPassword;
        existing.lastUsedAt = Date.now();
        updatedCount++;
      } else {
        credentials.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          domain: item.domain,
          username: item.username,
          encryptedPassword,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
        });
        addedCount++;
      }
    }
    saveData('credentials.json', credentials);
    log.info(`Imported vault: ${addedCount} added, ${updatedCount} updated`);
    return { ok: true, added: addedCount, updated: updatedCount };
  } catch (err) {
    // Wrong master password produces a decipher/auth-tag failure — indistinguishable from
    // a corrupted file, so we give one generic message rather than leaking which it was.
    return { ok: false, error: 'Mot de passe maître incorrect ou fichier corrompu.' };
  }
});

// ===== Password manager =====

// A login form was submitted on a page (from view-preload.ts's capture-phase submit
// listener). Decide whether to show a "save" or "update" prompt — never save silently.
ipcMain.on('credential-candidate', (e, data: { username: string; password: string }) => {
  if (!data?.username || !data?.password) return;
  const found = findTabByViewContentsId(e.sender.id);
  if (!found) return;
  const { win, tab } = found;
  if ((win as any).toraPrivate) return; // never offer to save passwords in a private window

  const domain = getRegistrableDomain(tab.url);
  if (!domain || neverSaveDomains.has(domain)) return;

  const existing = credentials.find(c => c.domain === domain && c.username === data.username);

  if (existing) {
    let existingPlain = '';
    try {
      if (safeStorage.isEncryptionAvailable()) {
        existingPlain = safeStorage.decryptString(Buffer.from(existing.encryptedPassword, 'base64'));
      }
    } catch (err) {}
    if (existingPlain === data.password) return; // already saved, nothing to prompt

    const pendingId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    pendingCredentials.set(pendingId, { domain, username: data.username, password: data.password, kind: 'update', existingId: existing.id, favicon: tab.favicon });
    win.webContents.send('credential-prompt', { pendingId, domain, username: data.username, kind: 'update' });
    return;
  }

  const pendingId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  pendingCredentials.set(pendingId, { domain, username: data.username, password: data.password, kind: 'save', favicon: tab.favicon });
  win.webContents.send('credential-prompt', { pendingId, domain, username: data.username, kind: 'save' });
});

ipcMain.on('confirm-save-credential', (e, pendingId: string) => {
  const pending = pendingCredentials.get(pendingId);
  pendingCredentials.delete(pendingId);
  if (!pending) return;

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('Tora: safeStorage encryption is unavailable on this system — credential was NOT saved.');
    return;
  }

  const encryptedPassword = safeStorage.encryptString(pending.password).toString('base64');

  if (pending.kind === 'update' && pending.existingId) {
    const entry = credentials.find(c => c.id === pending.existingId);
    if (entry) {
      entry.encryptedPassword = encryptedPassword;
      entry.lastUsedAt = Date.now();
      if (pending.favicon) entry.favicon = pending.favicon;
    }
  } else {
    credentials.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      domain: pending.domain,
      username: pending.username,
      encryptedPassword,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      favicon: pending.favicon,
    });
  }
  saveData('credentials.json', credentials);
});

ipcMain.on('dismiss-credential-prompt', (e, pendingId: string) => {
  pendingCredentials.delete(pendingId);
});

ipcMain.on('never-save-for-domain', (e, pendingId: string) => {
  const pending = pendingCredentials.get(pendingId);
  if (pending) {
    neverSaveDomains.add(pending.domain);
    saveData('never_save_domains.json', Array.from(neverSaveDomains));
  }
  pendingCredentials.delete(pendingId);
});

// The content script asks for a specific saved password only on a direct user
// interaction (focusing/clicking the password field or picking a suggestion) — never
// pushed proactively. Decrypted only for this single response, never broadcast/stored.
ipcMain.handle('request-credential-fill', (e, credentialId: string) => {
  const entry = credentials.find(c => c.id === credentialId);
  if (!entry) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const password = safeStorage.decryptString(Buffer.from(entry.encryptedPassword, 'base64'));
    entry.lastUsedAt = Date.now();
    saveData('credentials.json', credentials);
    return { username: entry.username, password };
  } catch (err) {
    return null;
  }
});

ipcMain.handle('get-credentials', () => credentials.map(toPublicCredential));

ipcMain.handle('delete-credential', (e, id: string) => {
  credentials = credentials.filter(c => c.id !== id);
  saveData('credentials.json', credentials);
  return credentials.map(toPublicCredential);
});


// ===== Password management: edit, health and breach check =====
function decryptStoredPassword(entry: StoredCredential): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(entry.encryptedPassword, 'base64'));
  } catch {
    return null;
  }
}

ipcMain.handle('update-credential', (_e, id: string, changes: { username?: string; password?: string }) => {
  const entry = credentials.find(c => c.id === id);
  if (!entry) return { ok: false, error: 'Identifiant introuvable.' };

  const username = typeof changes?.username === 'string' ? changes.username.trim() : entry.username;
  if (!username || username.length > 256) return { ok: false, error: "L'identifiant doit contenir entre 1 et 256 caractères." };
  if (credentials.some(c => c.id !== id && c.domain === entry.domain && c.username === username)) {
    return { ok: false, error: 'Un identifiant identique existe déjà pour ce site.' };
  }

  if (typeof changes?.password === 'string' && changes.password !== '') {
    if (changes.password.length > 1024) return { ok: false, error: 'Le mot de passe est trop long.' };
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'Le chiffrement système est indisponible.' };
    entry.encryptedPassword = safeStorage.encryptString(changes.password).toString('base64');
  }
  entry.username = username;
  saveData('credentials.json', credentials);
  return { ok: true, credentials: credentials.map(toPublicCredential) };
});

// Local only: nothing leaves the computer. Passwords are compared through SHA-256 digests in memory.
ipcMain.handle('get-password-health', () => {
  const plain = credentials.map(c => ({ id: c.id, password: decryptStoredPassword(c) }));
  const counts = new Map<string, number>();
  for (const p of plain) if (p.password) counts.set(sha256Hex(p.password), (counts.get(sha256Hex(p.password)) ?? 0) + 1);
  const result: Record<string, { weak: boolean; reused: boolean }> = {};
  for (const p of plain) {
    if (!p.password) continue;
    result[p.id] = { weak: isWeakPassword(p.password), reused: (counts.get(sha256Hex(p.password)) ?? 0) > 1 };
  }
  return result;
});

// "Have I Been Pwned" k-anonymity: only the first 5 characters of the password's SHA-1 hash are sent.
ipcMain.handle('check-password-breach', async (_e, id: string) => {
  const entry = credentials.find(c => c.id === id);
  const password = entry ? decryptStoredPassword(entry) : null;
  if (!password) return { ok: false, error: 'Mot de passe indisponible.' };
  const { prefix, suffix } = splitPwnedHash(password);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'Tora-Browser' },
      signal: controller.signal as any,
    });
    if (!res.ok) return { ok: false, error: `Service indisponible (${res.status}).` };
    return { ok: true, count: countInPwnedRange(await res.text(), suffix) };
  } catch {
    return { ok: false, error: 'Impossible de joindre le service de vérification. Vérifiez votre connexion.' };
  } finally {
    clearTimeout(timer);
  }
});

ipcMain.handle('reveal-credential-password', (e, id: string) => {
  const entry = credentials.find(c => c.id === id);
  if (!entry || !safeStorage.isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(entry.encryptedPassword, 'base64'));
  } catch {
    return '';
  }
});

ipcMain.on('copy-credential-username', (e, username: string) => {
  clipboard.writeText(username);
});

let clipboardClearTimer: NodeJS.Timeout | null = null;
ipcMain.on('copy-credential-password', (e, id: string) => {
  const entry = credentials.find(c => c.id === id);
  if (!entry || !safeStorage.isEncryptionAvailable()) return;
  try {
    const password = safeStorage.decryptString(Buffer.from(entry.encryptedPassword, 'base64'));
    clipboard.writeText(password);
    if (clipboardClearTimer) clearTimeout(clipboardClearTimer);
    clipboardClearTimer = setTimeout(() => {
      // Only clear if the clipboard still holds the password we put there (avoid
      // wiping something else the user copied in the meantime).
      if (clipboard.readText() === password) clipboard.writeText('');
      clipboardClearTimer = null;
    }, 30000);
  } catch (err) {}
});

ipcMain.handle('get-installed-extensions', async () => {
  return extensionManager.getExtensions();
});

ipcMain.handle('install-extension-dialog', async (e) => {
  const win = getWin(e);
  if (!win) return { ok: false, error: 'Fenêtre introuvable.' };
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Sélectionner le dossier décompressé de l\'extension Chrome (contenant manifest.json)',
    properties: ['openDirectory'],
  });
  if (canceled || filePaths.length === 0) return { ok: false, error: 'Annulé.' };
  return extensionManager.installExtension(filePaths[0]);
});

ipcMain.handle('toggle-extension-status', async (e, id: string, enabled: boolean) => {
  return extensionManager.toggleExtension(id, enabled);
});

ipcMain.handle('delete-extension', async (e, id: string) => {
  return extensionManager.removeExtension(id);
});
