import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tora', {
  createTab: (url?: string) => ipcRenderer.send('create-tab', url),
  closeTab: (id: string) => ipcRenderer.send('close-tab', id),
  switchTab: (id: string) => ipcRenderer.send('switch-tab', id),
  navigate: (id: string, url: string) => ipcRenderer.send('navigate', id, url),
  goBack: (id: string) => ipcRenderer.send('go-back', id),
  goForward: (id: string) => ipcRenderer.send('go-forward', id),
  reload: (id: string) => ipcRenderer.send('reload', id),
  
  toggleAdBlock: () => ipcRenderer.send('toggle-adblock'),
  toggleAdultFilter: (enabled: boolean) => ipcRenderer.send('toggle-adult-filter', enabled),
  updateSettings: (settings: any) => ipcRenderer.send('update-settings', settings),
  
  allowPopupOnce: (id: string) => ipcRenderer.send('allow-popup-once', id),
  forceNavigate: (id: string, url: string) => ipcRenderer.send('force-navigate', id, url),
  
  onTabUpdated: (callback: any) => {
    const listener = (_event: any, tabs: any, activeTabId: any, settings: any) => callback(tabs, activeTabId, settings);
    ipcRenderer.on('tab-updated', listener);
    return () => ipcRenderer.removeListener('tab-updated', listener);
  },
  onProtectionEvent: (callback: any) => {
    const listener = (_event: any, tabId: any, type: any, url: any) => callback(tabId, type, url);
    ipcRenderer.on('protection-event', listener);
    return () => ipcRenderer.removeListener('protection-event', listener);
  },
  onDownloadsUpdated: (callback: any) => {
    const listener = (_event: any, downloads: any) => callback(downloads);
    ipcRenderer.on('downloads-updated', listener);
    return () => ipcRenderer.removeListener('downloads-updated', listener);
  },
  
  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
  saveShortcut: (title: string, url: string) => ipcRenderer.invoke('save-shortcut', title, url),
  deleteShortcut: (id: string) => ipcRenderer.invoke('delete-shortcut', id),
  
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  deleteHistoryEntry: (id: string) => ipcRenderer.invoke('delete-history-entry', id),
  
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  showItemInFolder: (path: string) => ipcRenderer.send('show-item-in-folder', path),
  openItem: (path: string) => ipcRenderer.send('open-item', path),
  pauseDownload: (id: string) => ipcRenderer.send('pause-download', id),
  resumeDownload: (id: string) => ipcRenderer.send('resume-download', id),
  cancelDownload: (id: string) => ipcRenderer.send('cancel-download', id),
  retryDownload: (id: string) => ipcRenderer.send('retry-download', id),
  removeDownload: (id: string) => ipcRenderer.send('remove-download', id),
  clearDownloads: () => ipcRenderer.send('clear-downloads'),
  reopenClosedTab: () => ipcRenderer.send('reopen-closed-tab'),
  createPrivateWindow: () => ipcRenderer.send('create-private-window'),
  printPage: () => ipcRenderer.send('print-page'),
  savePagePdf: () => ipcRenderer.send('save-page-pdf'),
  savePageHtml: () => ipcRenderer.send('save-page-html'),
  viewSource: () => ipcRenderer.send('view-source'),
  getSuggestions: (query: string) => ipcRenderer.invoke('get-suggestions', query),
  requestTabState: () => ipcRenderer.send('request-tab-state'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  openDataFolder: () => ipcRenderer.send('open-data-folder'),
  openLogFolder: () => ipcRenderer.send('open-log-folder'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateStatus: (callback: any) => {
    const listener = (_event: any, status: any) => callback(status);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  getContainers: () => ipcRenderer.invoke('get-containers'),
  saveContainer: (container: any) => ipcRenderer.invoke('save-container', container),
  deleteContainer: (id: string) => ipcRenderer.invoke('delete-container', id),
  createContainerTab: (id: string, url?: string) => ipcRenderer.send('create-container-tab', id, url),
  certProceed: (tabId: string) => ipcRenderer.send('cert-proceed', tabId),
  threatProceed: (tabId: string) => ipcRenderer.send('threat-proceed', tabId),
  threatGoBack: (tabId: string) => ipcRenderer.send('threat-go-back', tabId),
  certGoBack: (tabId: string) => ipcRenderer.send('cert-go-back', tabId),
  clearBrowsingData: (options: any) => ipcRenderer.invoke('clear-browsing-data', options),
  chooseDownloadDirectory: () => ipcRenderer.invoke('choose-download-directory'),
  onShortcutAction: (callback: any) => {
    const listener = (_event: any, action: any) => callback(action);
    ipcRenderer.on('shortcut-action', listener);
    return () => ipcRenderer.removeListener('shortcut-action', listener);
  },
  onStorageError: (callback: any) => {
    const listener = (_event: any, file: any) => callback(file);
    ipcRenderer.on('storage-error', listener);
    return () => ipcRenderer.removeListener('storage-error', listener);
  },
  
  createNewWindow: () => ipcRenderer.send('create-new-window'),
  quitApp: () => ipcRenderer.send('quit-app'),
  openDevTools: () => ipcRenderer.send('open-devtools'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  setOverlayActive: (reason: string, active: boolean) => ipcRenderer.send('set-overlay-active', reason, active),

  getCredentials: () => ipcRenderer.invoke('get-credentials'),
  deleteCredential: (id: string) => ipcRenderer.invoke('delete-credential', id),
  revealCredentialPassword: (id: string) => ipcRenderer.invoke('reveal-credential-password', id),
  updateCredential: (id: string, changes: any) => ipcRenderer.invoke('update-credential', id, changes),
  getPasswordHealth: () => ipcRenderer.invoke('get-password-health'),
  checkPasswordBreach: (id: string) => ipcRenderer.invoke('check-password-breach', id),
  copyCredentialUsername: (username: string) => ipcRenderer.send('copy-credential-username', username),
  copyCredentialPassword: (id: string) => ipcRenderer.send('copy-credential-password', id),
  confirmSaveCredential: (pendingId: string) => ipcRenderer.send('confirm-save-credential', pendingId),
  dismissCredentialPrompt: (pendingId: string) => ipcRenderer.send('dismiss-credential-prompt', pendingId),
  neverSaveForDomain: (pendingId: string) => ipcRenderer.send('never-save-for-domain', pendingId),
  onCredentialPrompt: (callback: any) => {
    const listener = (_event: any, prompt: any) => callback(prompt);
    ipcRenderer.on('credential-prompt', listener);
    return () => ipcRenderer.removeListener('credential-prompt', listener);
  },
  onWindowMaximizedChange: (callback: (isMaximized: boolean) => void) => {
    const listener = (_event: any, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('window-maximized-change', listener);
    return () => ipcRenderer.removeListener('window-maximized-change', listener);
  },

  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  toggleBookmark: (id: string) => ipcRenderer.invoke('toggle-bookmark', id),
  deleteBookmark: (id: string) => ipcRenderer.invoke('delete-bookmark', id),

  zoomIn: () => ipcRenderer.send('zoom-in'),
  zoomOut: () => ipcRenderer.send('zoom-out'),
  zoomReset: () => ipcRenderer.send('zoom-reset'),

  findInPage: (query: string) => ipcRenderer.send('find-in-page', query),
  findInPageNext: (query: string, forward: boolean) => ipcRenderer.send('find-in-page-next', query, forward),
  stopFindInPage: () => ipcRenderer.send('stop-find-in-page'),
  onFindInPageResult: (callback: (result: { matches: number; activeMatchOrdinal: number }) => void) => {
    const listener = (_event: any, result: any) => callback(result);
    ipcRenderer.on('find-in-page-result', listener);
    return () => ipcRenderer.removeListener('find-in-page-result', listener);
  },
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
    const listener = (_event: any, isFullscreen: boolean) => callback(isFullscreen);
    ipcRenderer.on('fullscreen-change', listener);
    return () => ipcRenderer.removeListener('fullscreen-change', listener);
  },

  onFocusAddressBar: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('focus-address-bar', listener);
    return () => ipcRenderer.removeListener('focus-address-bar', listener);
  },
  onShowFindBar: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('show-find-bar', listener);
    return () => ipcRenderer.removeListener('show-find-bar', listener);
  },

  exportCredentials: (masterPassword: string) => ipcRenderer.invoke('export-credentials', masterPassword),
  importCredentials: (masterPassword: string) => ipcRenderer.invoke('import-credentials', masterPassword),

  getLifetimeStats: () => ipcRenderer.invoke('get-lifetime-stats'),
  toggleReaderMode: () => ipcRenderer.send('toggle-reader-mode'),
  stopLoad: (id: string) => ipcRenderer.send('stop-load', id),
  onPageSnapshot: (callback: (dataUrl: string | null) => void) => {
    const listener = (_event: any, dataUrl: string | null) => callback(dataUrl);
    ipcRenderer.on('page-snapshot', listener);
    return () => ipcRenderer.removeListener('page-snapshot', listener);
  },
  capturePage: (mode: 'save' | 'clipboard') => ipcRenderer.invoke('capture-page', mode),
  getPageQrCode: () => ipcRenderer.invoke('get-page-qrcode'),
  generateFakePersona: () => ipcRenderer.invoke('generate-fake-persona'),
  triggerPip: () => ipcRenderer.invoke('trigger-pip'),

  respondPermission: (pendingId: string, granted: boolean, remember: boolean) => ipcRenderer.send('respond-permission', pendingId, granted, remember),
  rememberPermission: (domain: string, permission: string, decision: 'granted' | 'denied') => ipcRenderer.send('remember-permission', domain, permission, decision),
  onPermissionPrompt: (callback: (prompt: { pendingId: string; tabId: string; domain: string; permission: string }) => void) => {
    const listener = (_event: any, prompt: any) => callback(prompt);
    ipcRenderer.on('permission-prompt', listener);
    return () => ipcRenderer.removeListener('permission-prompt', listener);
  },
  getDomainSettings: (domain: string) => ipcRenderer.invoke('get-domain-settings', domain),
  setDomainSetting: (domain: string, key: 'adBlockDisabled' | 'darkModeForced' | 'thirdPartyCookiesAllowed', value: boolean) => ipcRenderer.invoke('set-domain-setting', domain, key, value),
  clearDomainPermissions: (domain: string) => ipcRenderer.invoke('clear-domain-permissions', domain),
  reorderTabs: (newOrderIds: string[]) => ipcRenderer.send('reorder-tabs', newOrderIds),
  setTabGroupColor: (id: string, color: string | null) => ipcRenderer.send('set-tab-group-color', id, color),

  getFocusMode: () => ipcRenderer.invoke('get-focus-mode'),
  updateFocusMode: (partial: any) => ipcRenderer.invoke('update-focus-mode', partial),
  addFocusBlockedSite: (site: string) => ipcRenderer.invoke('add-focus-blocked-site', site),
  removeFocusBlockedSite: (site: string) => ipcRenderer.invoke('remove-focus-blocked-site', site),

  importChromeBookmarks: () => ipcRenderer.invoke('import-chrome-bookmarks'),
  importChromePasswords: () => ipcRenderer.invoke('import-chrome-passwords'),

  getInstalledExtensions: () => ipcRenderer.invoke('get-installed-extensions'),
  installExtensionDialog: () => ipcRenderer.invoke('install-extension-dialog'),
  toggleExtensionStatus: (id: string, enabled: boolean) => ipcRenderer.invoke('toggle-extension-status', id, enabled),
  deleteExtension: (id: string) => ipcRenderer.invoke('delete-extension', id),

  downloadVideo: (url: string) => ipcRenderer.invoke('download-video', url),
  toggleTabMute: (id: string) => ipcRenderer.send('toggle-tab-mute', id),
  duplicateTab: (id: string) => ipcRenderer.send('duplicate-tab', id),
  pinTab: (id: string, pinned: boolean) => ipcRenderer.send('pin-tab', id, pinned),
  closeOtherTabs: (id: string) => ipcRenderer.send('close-other-tabs', id),
  closeTabsToRight: (id: string) => ipcRenderer.send('close-tabs-to-right', id),
});
