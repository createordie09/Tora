import { useEffect, useState, useMemo, lazy, Suspense, FormEvent } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import TabStrip from './components/TabStrip';
import VerticalTabStrip from './components/VerticalTabStrip';
import Toolbar from './components/Toolbar';
import RedirectBanner from './components/RedirectBanner';
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const HistoryPage = lazy(() => import('./components/HistoryPage'));
const DownloadsPage = lazy(() => import('./components/DownloadsPage'));
const ExtensionsPage = lazy(() => import('./components/ExtensionsPage'));
import CredentialSaveBanner from './components/CredentialSaveBanner';
import PermissionPromptBanner from './components/PermissionPromptBanner';
const PasswordsPage = lazy(() => import('./components/PasswordsPage'));
const BookmarksPage = lazy(() => import('./components/BookmarksPage'));
const FocusPage = lazy(() => import('./components/FocusPage'));
const AboutPage = lazy(() => import('./components/AboutPage'));
import ErrorBoundary from './components/ErrorBoundary';
import CertWarningPage from './components/CertWarningPage';
import ThreatWarningPage from './components/ThreatWarningPage';
import FindBar from './components/FindBar';
import CommandPaletteModal from './components/CommandPaletteModal';
import QrCodeModal from './components/QrCodeModal';
import FakePersonaModal from './components/FakePersonaModal';
import MainMenuModal from './components/MainMenuModal';
import { ToastProvider, useToast } from './components/Toast';
import { TabData, ToraSettings, Shortcut, CredentialPrompt, LifetimeStats, PermissionPrompt, FakePersona } from './types';
import { Search, Github, Youtube, Plus, X, AlertOctagon, ShieldCheck, Settings, ShieldHalf } from 'lucide-react';
import { fadeIn, scaleIn } from './lib/motion';
import { CONTENT_TOP } from './lib/layout';
import { useUndoableDelete } from './hooks/useUndoableDelete';
import Button from './components/Button';

function HomeSearchBar({ activeTabId }: { activeTabId: string | null }) {
  const [inputUrl, setInputUrl] = useState('');

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (activeTabId && inputUrl.trim()) {
      window.tora?.navigate(activeTabId, inputUrl.trim());
      setInputUrl('');
    }
  };

  return (
    <form onSubmit={handleSearchSubmit} className="w-full max-w-xl relative group mb-8">
      <input
        type="text"
        value={inputUrl}
        onChange={(e) => setInputUrl(e.target.value)}
        placeholder="Rechercher sur le web ou saisir une URL"
        aria-label="Rechercher sur le web ou saisir une URL"
        className="w-full h-14 bg-surface-1 border border-line-strong rounded-full pl-14 pr-36 text-[14px] text-white transition-all placeholder-subtle shadow-xl"
      />
      <div className="absolute left-5 top-0 h-14 flex items-center text-subtle group-focus-within:text-white transition-colors">
        <Search className="w-[18px] h-[18px]" aria-hidden="true" />
      </div>
      <button
        type="button"
        onClick={() => window.tora?.createTab('tora://extensions')}
        aria-label="Ouvrir la page des protections"
        className="absolute right-2 top-2 h-10 px-4 flex items-center gap-1.5 rounded-full bg-surface-2 hover:bg-surface-3 border border-line text-[12px] font-medium text-muted hover:text-white transition-colors cursor-pointer"
      >
        <ShieldCheck size={13} className="text-indigo-400" aria-hidden="true" />
        <span>Protections</span>
      </button>
    </form>
  );
}

function AppShell() {
  const undoableDelete = useUndoableDelete();
  const { showToast } = useToast();
  useEffect(() => {
    return window.tora?.onStorageError?.((file) => {
      showToast(`Impossible d'enregistrer vos données (${file.replace(/\.json$/, '')}). Vérifiez l'espace disque.`, 'error');
    });
  }, [showToast]);
  useEffect(() => {
    return window.tora?.onUpdateStatus?.((status) => {
      if (status.state === 'ready') {
        showToast(`La mise à jour ${status.version ?? ''} de Tora est prête.`, 'info', {
          duration: 15000,
          action: { label: 'Redémarrer', onClick: () => window.tora?.installUpdate() },
        });
      }
    });
  }, [showToast]);
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats | null>(null);
  
  const [settings, setSettings] = useState<ToraSettings>({ 
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
  });
  
  const [bannerInfo, setBannerInfo] = useState<{tabId: string, type: 'redirect' | 'loop' | 'popup', url?: string} | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [credentialPrompt, setCredentialPrompt] = useState<CredentialPrompt | null>(null);
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPrompt | null>(null);
  const [pageSnapshot, setPageSnapshot] = useState<string | null>(null);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<{ dataUrl: string; url: string } | null>(null);
  const [fakePersonaData, setFakePersonaData] = useState<FakePersona | null>(null);

  const isPermissionActive = !!(permissionPrompt && (!permissionPrompt.tabId || permissionPrompt.tabId === activeTabId));
  const isCredentialActive = !!credentialPrompt;
  const isRedirectActive = !!(bannerInfo && bannerInfo.tabId === activeTabId);
  const isModalActive = menuOpen || isCommandPaletteOpen || !!qrCodeData || !!fakePersonaData;

  // Overlay management to retract native BrowserView when overlays or banners are active
  useEffect(() => {
    window.tora?.setOverlayActive('menu', menuOpen);
  }, [menuOpen]);

  useEffect(() => {
    window.tora?.setOverlayActive('command-palette', isCommandPaletteOpen);
  }, [isCommandPaletteOpen]);

  useEffect(() => {
    window.tora?.setOverlayActive('qrcode', !!qrCodeData);
  }, [qrCodeData]);

  useEffect(() => {
    window.tora?.setOverlayActive('fake-persona', !!fakePersonaData);
  }, [fakePersonaData]);

  useEffect(() => {
    window.tora?.setOverlayActive('permission-prompt', isPermissionActive);
  }, [isPermissionActive]);

  useEffect(() => {
    window.tora?.setOverlayActive('credential-prompt', isCredentialActive);
  }, [isCredentialActive]);

  useEffect(() => {
    window.tora?.setOverlayActive('redirect-banner', isRedirectActive);
  }, [isRedirectActive]);

  // Clean up prompts/banners if their originating tab has been closed
  useEffect(() => {
    if (permissionPrompt?.tabId && !tabs.some(t => t.id === permissionPrompt.tabId)) {
      setPermissionPrompt(null);
    }
    if (bannerInfo?.tabId && !tabs.some(t => t.id === bannerInfo.tabId)) {
      setBannerInfo(null);
    }
  }, [tabs, permissionPrompt, bannerInfo]);

  // Global Ctrl+K / Cmd+K handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOpenQrCode = async () => {
    const result = await window.tora?.getPageQrCode();
    if (result && result.ok && result.dataUrl && result.url) {
      setQrCodeData({ dataUrl: result.dataUrl, url: result.url });
    }
  };

  const handleOpenFakePersona = async () => {
    const persona = await window.tora?.generateFakePersona();
    if (persona) {
      setFakePersonaData(persona);
    }
  };

  // Right before the page gets detached for an overlay, main process sends a frozen
  // snapshot of it — shown here, blurred, in place of a jarring plain black gap.
  useEffect(() => {
    const unsub = window.tora?.onPageSnapshot(setPageSnapshot);
    return unsub;
  }, []);

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const unsub = window.tora?.onFullscreenChange(setIsFullscreen);
    return unsub;
  }, []);

  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [isAddingShortcut, setIsAddingShortcut] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [shortcutBusy, setShortcutBusy] = useState(false);
  const [newShortcutName, setNewShortcutName] = useState('');
  const [newShortcutUrl, setNewShortcutUrl] = useState('');
  // Built-in shortcuts can be hidden; the choice is kept on this device.
  const [hiddenDefaults, setHiddenDefaults] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('tora.hiddenDefaultShortcuts') || '[]'); } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem('tora.hiddenDefaultShortcuts', JSON.stringify(hiddenDefaults)); } catch { /* storage unavailable */ }
  }, [hiddenDefaults]);

  useEffect(() => {
    if (window.tora) {
      const unsubscribe = window.tora.onTabUpdated((updatedTabs, currentActiveId, updatedSettings) => {
        setTabs(updatedTabs);
        setActiveTabId(currentActiveId);
        if (updatedSettings) {
          setSettings(updatedSettings);
        }
      });
      // The first broadcast from the main process can arrive before this listener exists:
      // always ask for the current state once subscribed.
      window.tora.requestTabState?.();
      const unsubProtection = window.tora.onProtectionEvent((tabId, type, url) => {
        setBannerInfo({ tabId, type, url });
      });
      const unsubCredential = window.tora.onCredentialPrompt((prompt) => {
        setCredentialPrompt(prompt);
      });
      const unsubPermission = window.tora.onPermissionPrompt((prompt) => {
        setPermissionPrompt(prompt);
      });
      
      window.tora.getShortcuts().then(setShortcuts);
      window.tora.getLifetimeStats().then(setLifetimeStats);
      
      return () => {
        unsubscribe();
        unsubProtection();
        unsubCredential();
        unsubPermission();
      };
    } else {
      setTabs([{ id: 'mock', title: 'Nouvel onglet', url: '', isLoading: false, canGoBack: false, canGoForward: false, blockedCount: 0, popupsBlockedCount: 0, redirectsBlockedCount: 0, scarewareBlockedCount: 0 }]);
      setActiveTabId('mock');
    }
  }, []);

  const activeTab = tabs.find(t => t.id === activeTabId);

  // Refresh the lifetime protection counters whenever the new-tab page becomes active
  // (the only place they're shown), so the number stays current across a session.
  useEffect(() => {
    if (activeTab?.url === '') window.tora?.getLifetimeStats().then(setLifetimeStats);
  }, [activeTab?.url]);

  const resetShortcutForm = () => {
    setIsAddingShortcut(false);
    setNewShortcutName('');
    setNewShortcutUrl('');
    setShortcutError(null);
  };

  const handleAddShortcut = async (e?: FormEvent) => {
    e?.preventDefault();
    const name = newShortcutName.trim();
    let url = newShortcutUrl.trim();
    if (!name) { setShortcutError('Saisissez un nom pour le raccourci.'); return; }
    if (!url) { setShortcutError("Saisissez l'adresse du site, par exemple exemple.com."); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') throw new Error('invalid');
    } catch {
      setShortcutError("Cette adresse n'est pas valide. Exemple : exemple.com");
      return;
    }
    setShortcutBusy(true);
    try {
      if (window.tora) {
        const updated = await window.tora.saveShortcut(name, url);
        setShortcuts(updated);
      } else {
        setShortcuts([...shortcuts, { id: 'mock', title: name, url }]);
      }
      resetShortcutForm();
    } catch {
      setShortcutError("Impossible d'enregistrer le raccourci. Réessayez.");
    } finally {
      setShortcutBusy(false);
    }
  };

  const handleDeleteShortcut = (shortcut: Shortcut, isDefault = false) => {
    if (isDefault) {
      undoableDelete(
        `shortcut:${shortcut.id}`,
        `Raccourci « ${shortcut.title} » masqué`,
        () => setHiddenDefaults(prev => [...prev, shortcut.id]),
        () => setHiddenDefaults(prev => prev.filter(id => id !== shortcut.id)),
        () => {},
      );
      return;
    }
    undoableDelete(
      `shortcut:${shortcut.id}`,
      `Raccourci « ${shortcut.title} » supprimé`,
      () => setShortcuts(prev => prev.filter(s => s.id !== shortcut.id)),
      () => setShortcuts(prev => [...prev, shortcut]),
      () => {
        if (window.tora) window.tora.deleteShortcut(shortcut.id).then(setShortcuts).catch(() => {});
      },
    );
  };

  const handleSaveCredential = (pendingId: string) => {
    window.tora?.confirmSaveCredential(pendingId);
    setCredentialPrompt(null);
  };

  const handleNeverForSite = (pendingId: string) => {
    window.tora?.neverSaveForDomain(pendingId);
    setCredentialPrompt(null);
  };

  const handleDismissCredentialPrompt = (pendingId: string) => {
    window.tora?.dismissCredentialPrompt(pendingId);
    setCredentialPrompt(null);
  };

  const allShortcuts = useMemo(() => [
    { id: 'github', title: 'GitHub', url: 'https://github.com', isDefault: true, icon: <Github className="w-5 h-5 text-muted group-hover:text-white transition-colors" /> },
    { id: 'notion', title: 'Notion', url: 'https://notion.so', isDefault: true, textIcon: 'N', textClass: 'text-indigo-400' },
    { id: 'youtube', title: 'YouTube', url: 'https://youtube.com', isDefault: true, icon: <Youtube className="w-5 h-5 text-red-500 group-hover:text-red-400 transition-colors" /> },
    ...shortcuts.map(s => ({ ...s, isDefault: false, textIcon: s.title.charAt(0).toUpperCase(), textClass: 'text-emerald-400' }))
  ].filter(s => !(s.isDefault && hiddenDefaults.includes(s.id))), [shortcuts, hiddenDefaults]);

  return (
    <MotionConfig reducedMotion="user">
      <>
        <div className={`flex h-full w-full bg-[#000000] text-ink overflow-hidden relative font-sans ${settings.isVerticalTabsEnabled ? 'flex-row' : 'flex-col'}`}>
      <AnimatePresence initial={false}>
        {settings.isVerticalTabsEnabled && !isFullscreen && (
          <motion.aside
            aria-label="Onglets"
            key="vertical-sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 232, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="h-full overflow-hidden shrink-0"
          >
            <VerticalTabStrip tabs={tabs} activeTabId={activeTabId} />
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="flex flex-col flex-1 min-w-0 h-full relative overflow-hidden">
        {!isFullscreen && (
          <header className="flex flex-col shrink-0 relative z-20">
            {!settings.isVerticalTabsEnabled && <TabStrip tabs={tabs} activeTabId={activeTabId} />}
            <Toolbar 
              activeTab={activeTab} 
              settings={settings} 
              menuOpen={menuOpen}
              setMenuOpen={setMenuOpen}
              onOpenQrCode={handleOpenQrCode}
              onOpenFakePersona={handleOpenFakePersona}
            />
          </header>
        )}

      {/* Frozen snapshot of the page — shown only while an overlay or banner has
          detached the real BrowserView, so the person sees the page content or a frosted-glass
          effect instead of a jarring plain black gap. */}
      {pageSnapshot && (
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            top: settings.isVerticalTabsEnabled ? CONTENT_TOP.vertical : CONTENT_TOP.horizontal,
            backgroundImage: `url(${pageSnapshot})`,
            backgroundSize: 'cover',
            backgroundPosition: 'top',
            filter: isModalActive ? 'blur(18px) brightness(0.55)' : 'brightness(0.96)',
            transform: isModalActive ? 'scale(1.05)' : 'none',
          }}
        />
      )}

      <CredentialSaveBanner
        prompt={isCredentialActive ? credentialPrompt : null}
        onSave={handleSaveCredential}
        onNeverForSite={handleNeverForSite}
        onDismiss={handleDismissCredentialPrompt}
        isVerticalTabsEnabled={settings.isVerticalTabsEnabled}
      />

      <PermissionPromptBanner
        prompt={isPermissionActive ? permissionPrompt : null}
        onDismiss={() => setPermissionPrompt(null)}
        isVerticalTabsEnabled={settings.isVerticalTabsEnabled}
      />

      <FindBar isVerticalTabsEnabled={settings.isVerticalTabsEnabled} />

      {isRedirectActive && bannerInfo && (
        <RedirectBanner
          bannerInfo={bannerInfo}
          onDismiss={() => setBannerInfo(null)}
          isVerticalTabsEnabled={settings.isVerticalTabsEnabled}
          onAllow={() => {
            if (bannerInfo.type === 'redirect' && bannerInfo.url) {
              window.tora?.forceNavigate(bannerInfo.tabId, bannerInfo.url);
            } else if (bannerInfo.type === 'popup') {
              window.tora?.allowPopupOnce(bannerInfo.tabId);
            }
            setBannerInfo(null);
          }}
        />
      )}
      
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {activeTab && activeTab.url !== '' && !activeTab.url.startsWith('tora://') && (
        <h1 className="sr-only">{activeTab.title || activeTab.url}</h1>
      )}
      {activeTab && activeTab.isCrashed && (
        <div className="flex-1 flex flex-col items-center justify-center bg-surface-0 text-center p-10">
          <AlertOctagon size={32} className="text-red-400/70 mb-4" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-[14px] font-medium text-ink mb-1">Cette page a cessé de fonctionner</p>
          <p className="text-[12px] text-subtle max-w-md mb-5">{activeTab.url}</p>
          <Button aria-label="Recharger la page" onClick={() => window.tora?.reload(activeTab.id)}>
            Recharger la page
          </Button>
        </div>
      )}

      <Suspense fallback={<div role="status" aria-label="Chargement…" className="flex-1 bg-surface-0" />}>
      <AnimatePresence mode="wait">
        {activeTab && activeTab.threatWarning && (
          <motion.div key={`${activeTab.id}-threat`} {...fadeIn} className="flex-1 flex flex-col overflow-hidden">
            <ThreatWarningPage tab={activeTab as typeof activeTab & { threatWarning: NonNullable<typeof activeTab.threatWarning> }} />
          </motion.div>
        )}
        {activeTab && activeTab.certError && (
          <motion.div key={`${activeTab.id}-cert`} {...fadeIn} className="flex-1 flex flex-col overflow-hidden">
            <CertWarningPage tab={activeTab as typeof activeTab & { certError: NonNullable<typeof activeTab.certError> }} />
          </motion.div>
        )}
        {activeTab && !activeTab.isCrashed && activeTab.url === 'tora://settings' && (
          <motion.div key={activeTab.id} {...fadeIn} className="flex-1 flex flex-col overflow-hidden">
            <ErrorBoundary label="Paramètres"><SettingsPage settings={settings} /></ErrorBoundary>
          </motion.div>
        )}
        {activeTab && !activeTab.isCrashed && activeTab.url === 'tora://history' && (
          <motion.div key={activeTab.id} {...fadeIn} className="flex-1 flex flex-col overflow-hidden">
            <ErrorBoundary label="Historique"><HistoryPage /></ErrorBoundary>
          </motion.div>
        )}
        {activeTab && !activeTab.isCrashed && activeTab.url === 'tora://downloads' && (
          <motion.div key={activeTab.id} {...fadeIn} className="flex-1 flex flex-col overflow-hidden">
            <ErrorBoundary label="Téléchargements"><DownloadsPage /></ErrorBoundary>
          </motion.div>
        )}
        {activeTab && !activeTab.isCrashed && activeTab.url === 'tora://extensions' && (
          <motion.div key={activeTab.id} {...fadeIn} className="flex-1 flex flex-col overflow-hidden">
            <ErrorBoundary label="Protections"><ExtensionsPage settings={settings} /></ErrorBoundary>
          </motion.div>
        )}
        {activeTab && !activeTab.isCrashed && activeTab.url === 'tora://bookmarks' && (
          <motion.div key={activeTab.id} {...fadeIn} className="flex-1 flex flex-col overflow-hidden">
            <ErrorBoundary label="Favoris"><BookmarksPage /></ErrorBoundary>
          </motion.div>
        )}
        {activeTab && !activeTab.isCrashed && activeTab.url === 'tora://passwords' && (
          <motion.div key={activeTab.id} {...fadeIn} className="flex-1 flex flex-col overflow-hidden">
            <ErrorBoundary label="Mots de passe"><PasswordsPage /></ErrorBoundary>
          </motion.div>
        )}
        {activeTab && !activeTab.isCrashed && activeTab.url === 'tora://about' && (
          <motion.div key={activeTab.id} {...fadeIn} className="flex-1 flex flex-col overflow-hidden">
            <ErrorBoundary label="À propos"><AboutPage /></ErrorBoundary>
          </motion.div>
        )}
        {activeTab && !activeTab.isCrashed && activeTab.url === 'tora://focus' && (
          <motion.div key={activeTab.id} {...fadeIn} className="flex-1 flex flex-col overflow-hidden">
            <ErrorBoundary label="Mode Focus"><FocusPage /></ErrorBoundary>
          </motion.div>
        )}

        {activeTab && !activeTab.isCrashed && activeTab.url.startsWith('tora://') && 
          !['tora://settings', 'tora://history', 'tora://downloads', 'tora://extensions', 'tora://bookmarks', 'tora://passwords', 'tora://focus', 'tora://about'].includes(activeTab.url) && (
            <motion.div key={activeTab.id} {...fadeIn} className="flex-1 flex flex-col items-center justify-center bg-surface-0 text-center p-10">
              <div className="w-14 h-14 rounded-2xl bg-surface-1 border border-line flex items-center justify-center text-indigo-400 mb-4 shadow-lg">
                <AlertOctagon size={28} />
              </div>
              <h1 className="text-[18px] font-semibold text-ink mb-2">Page introuvable</h1>
              <p className="text-[13px] text-subtle max-w-sm mb-6">
                L'adresse interne <code className="text-indigo-400 px-1.5 py-0.5 bg-white/5 rounded font-mono text-[12px]">{activeTab.url}</code> n'existe pas.
              </p>
              <Button variant="primary" aria-label="Retour à l'accueil" onClick={() => window.tora?.navigate(activeTab.id, '')}>
                Retour à l'accueil
              </Button>
            </motion.div>
        )}

        {activeTab && !activeTab.isCrashed && activeTab.url === '' && (
          <motion.div key={activeTab.id} {...fadeIn} className="flex-1 flex flex-col bg-surface-0 relative overflow-y-auto">
          {/* Top-right quick links: one path per destination */}
          <div className="flex items-center justify-end gap-4 px-8 pt-6 text-[13px] text-muted">
            <button type="button" className="hover:text-ink transition-colors focus-visible:ring-1 focus-visible:ring-indigo-400 rounded px-1.5 py-0.5" onClick={() => window.tora?.createTab('tora://bookmarks')}>Favoris</button>
            <button
              type="button"
              onClick={() => window.tora?.createTab('tora://settings')}
              className="w-8 h-8 rounded-full bg-surface-1 border border-line flex items-center justify-center hover:border-indigo-500/50 text-muted hover:text-white transition-colors focus-visible:ring-1 focus-visible:ring-indigo-400"
              title="Paramètres"
              aria-label="Ouvrir les Paramètres"
            >
              <Settings size={15} aria-hidden="true" />
            </button>
          </div>

          <div className="max-w-3xl w-full mx-auto px-12 pt-[8vh] pb-20 flex flex-col items-center">

            <div className="mb-10 flex flex-col items-center">
              <h1 className="text-[56px] font-semibold tracking-tight text-ink mb-1 leading-none font-display">Tora</h1>
              <p className="text-muted tracking-[0.15em] text-[12px] font-medium uppercase">Naviguez librement</p>
            </div>

            <HomeSearchBar activeTabId={activeTabId} />

            {settings.isPrivateWindow && (
              <div className="w-full max-w-xl mb-8 p-4 rounded-2xl bg-indigo-500/10 border border-indigo-400/30 text-[13px] text-indigo-100 leading-relaxed">
                <strong className="font-semibold">Vous naviguez en privé.</strong> Tora n'enregistre ni l'historique, ni les cookies, ni les mots de passe de cette fenêtre, et les efface à sa fermeture. Les sites visités, votre fournisseur d'accès et votre employeur peuvent toujours voir votre activité.
              </div>
            )}

            {lifetimeStats && (
              <div className="flex items-center gap-2 text-[12px] text-muted mb-10">
                <ShieldHalf size={13} className="text-indigo-400/80" />
                <span>
                  <span className="text-muted font-medium">
                    {(lifetimeStats.adsBlocked + lifetimeStats.popupsBlocked + lifetimeStats.redirectsBlocked + lifetimeStats.scarewareBlocked + lifetimeStats.cookieBannersRejected + (lifetimeStats.trackingParamsRemoved ?? 0) + (lifetimeStats.thirdPartyCookiesBlocked ?? 0) + (lifetimeStats.threatsBlocked ?? 0)).toLocaleString('fr-FR')}
                  </span> menaces bloquées depuis l'installation
                </span>
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-7 w-full">
              {allShortcuts.map((s) => (
                <div key={s.id} className="relative group w-[68px]">
                  <button
                    type="button"
                    onClick={() => window.tora?.navigate(activeTabId!, s.url)}
                    aria-label={`Ouvrir le raccourci ${s.title}`}
                    className="flex flex-col items-center space-y-2.5 cursor-pointer w-full rounded-xl"
                  >
                    <span className="w-14 h-14 bg-surface-1 border border-line rounded-full flex items-center justify-center group-hover:bg-surface-2 group-hover:border-line group-hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.5)] transition-all duration-200">
                      {(s as any).icon ? (s as any).icon : <span className={`text-lg font-bold ${(s as any).textClass}`}>{(s as any).textIcon}</span>}
                    </span>
                    <span className="text-[12px] font-medium text-muted group-hover:text-ink truncate w-full text-center transition-colors">{s.title}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`${s.isDefault ? 'Masquer' : 'Supprimer'} le raccourci ${s.title}`}
                    onClick={() => handleDeleteShortcut(s as Shortcut, s.isDefault)}
                    className="absolute -top-1 -right-1 bg-surface-3 border border-line-strong text-muted rounded-full p-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-red-700 hover:text-white hover:border-red-600 transition-all shadow-lg z-10"
                  >
                    <X size={10} strokeWidth={3} />
                  </button>
                </div>
              ))}

              {isAddingShortcut ? (
                <motion.form
                  {...scaleIn}
                  onSubmit={handleAddShortcut}
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); resetShortcutForm(); } }}
                  aria-label="Ajouter un raccourci"
                  className="flex flex-col p-3 bg-surface-1 border border-line-strong rounded-2xl w-56 shadow-2xl z-10"
                >
                  <label htmlFor="shortcut-name" className="text-[12px] text-muted mb-1">Nom</label>
                  <input
                    id="shortcut-name"
                    className="w-full bg-surface-2 text-ink text-[12px] px-3 py-2 mb-2 rounded-lg border border-line-strong"
                    placeholder="Mon site"
                    value={newShortcutName}
                    onChange={e => { setNewShortcutName(e.target.value); setShortcutError(null); }}
                    aria-invalid={!!shortcutError || undefined}
                    aria-describedby={shortcutError ? 'shortcut-error' : undefined}
                    autoFocus
                  />
                  <label htmlFor="shortcut-url" className="text-[12px] text-muted mb-1">Adresse</label>
                  <input
                    id="shortcut-url"
                    className="w-full bg-surface-2 text-ink text-[12px] px-3 py-2 mb-2 rounded-lg border border-line-strong"
                    placeholder="https://..."
                    value={newShortcutUrl}
                    onChange={e => { setNewShortcutUrl(e.target.value); setShortcutError(null); }}
                    aria-invalid={!!shortcutError || undefined}
                    aria-describedby={shortcutError ? 'shortcut-error' : undefined}
                  />
                  {shortcutError && <p id="shortcut-error" role="alert" className="text-[12px] text-red-400 mb-2">{shortcutError}</p>}
                  <div className="flex space-x-2 w-full">
                    <button type="submit" disabled={shortcutBusy} className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-medium text-[12px] py-2 rounded-lg transition-colors">{shortcutBusy ? 'Ajout…' : 'Ajouter'}</button>
                    <button type="button" className="flex-1 bg-surface-3 hover:bg-surface-3 text-muted hover:text-white text-[12px] py-2 rounded-lg transition-colors" onClick={resetShortcutForm}>Annuler</button>
                  </div>
                </motion.form>
              ) : (
                <button
                  type="button"
                  aria-label="Ajouter un raccourci"
                  className="flex flex-col items-center space-y-2.5 cursor-pointer group w-[68px] rounded-xl"
                  onClick={() => setIsAddingShortcut(true)}
                >
                  <span className="w-14 h-14 bg-surface-0 border border-dashed border-line-strong rounded-full flex items-center justify-center group-hover:bg-surface-1 group-hover:border-indigo-500/50 transition-all duration-200">
                    <Plus className="w-5 h-5 text-muted group-hover:text-indigo-400 transition-colors" aria-hidden="true" />
                  </span>
                  <span className="text-[12px] font-medium text-muted group-hover:text-ink transition-colors">Ajouter</span>
                </button>
              )}
            </div>

          </div>
          </motion.div>
        )}
      </AnimatePresence>
      </Suspense>
      </main>
      </div>

      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenQrCode={handleOpenQrCode}
        onOpenFakePersona={handleOpenFakePersona}
        activeTabUrl={activeTab?.url}
      />

      <MainMenuModal
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        activeTab={activeTab}
        onOpenQrCode={handleOpenQrCode}
        onOpenFakePersona={handleOpenFakePersona}
      />

      <QrCodeModal
        data={qrCodeData}
        onClose={() => setQrCodeData(null)}
      />

      <FakePersonaModal
        persona={fakePersonaData}
        onClose={() => setFakePersonaData(null)}
        onRegenerate={handleOpenFakePersona}
      />
      </div>
      </>
    </MotionConfig>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
