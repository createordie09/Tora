import { ArrowLeft, ArrowRight, RotateCw, X, Shield, Menu, Star, BookOpen, Download, Loader2, Lock, LockOpen, ShieldAlert, Search, Globe, Clock, EyeOff, Boxes } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { TabData, ToraSettings, Suggestion } from '../types';
import WindowControls from './WindowControls';
import SiteSettingsMenu from './SiteSettingsMenu';
import PrivacyPanel from './PrivacyPanel';
import { popIn, iconButtonPress, SPRING } from '../lib/motion';
import { useToast } from './Toast';

interface ToolbarProps {
  activeTab?: TabData;
  settings?: ToraSettings;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  onOpenQrCode?: () => void;
  onOpenFakePersona?: () => void;
}

export default function Toolbar({ activeTab, settings, menuOpen, setMenuOpen, onOpenQrCode, onOpenFakePersona }: ToolbarProps) {
  const [inputUrl, setInputUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const suggestionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const listboxId = 'omnibox-suggestions';

  const closeSuggestions = () => {
    if (suggestionTimer.current) clearTimeout(suggestionTimer.current);
    requestId.current++;
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
  };

  const handleInputChange = (value: string) => {
    setInputUrl(value);
    if (suggestionTimer.current) clearTimeout(suggestionTimer.current);
    if (!value.trim()) { closeSuggestions(); return; }
    const id = ++requestId.current;
    suggestionTimer.current = setTimeout(async () => {
      try {
        const results = await window.tora?.getSuggestions(value);
        if (id !== requestId.current) return; // a newer keystroke superseded this request
        setSuggestions(results || []);
        setActiveSuggestion(-1);
        setSuggestionsOpen(!!results && results.length > 0);
      } catch {
        closeSuggestions();
      }
    }, 120);
  };

  // The page view sits above the interface, so the dropdown needs the same "overlay"
  // treatment as menus: the page is frozen into a snapshot while suggestions are shown.
  const dropdownVisible = suggestionsOpen && suggestions.length > 0;
  useEffect(() => {
    window.tora?.setOverlayActive('omnibox', dropdownVisible);
    return () => { window.tora?.setOverlayActive('omnibox', false); };
  }, [dropdownVisible]);

  useEffect(() => () => { if (suggestionTimer.current) clearTimeout(suggestionTimer.current); }, []);

  useEffect(() => {
    window.tora?.setOverlayActive('privacy-panel', privacyOpen);
    return () => { window.tora?.setOverlayActive('privacy-panel', false); };
  }, [privacyOpen]);

  const pickSuggestion = (suggestion: Suggestion) => {
    if (!activeTab) return;
    closeSuggestions();
    window.tora?.navigate(activeTab.id, suggestion.url);
    inputRef.current?.blur();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!dropdownVisible) return;
      e.preventDefault();
      const count = suggestions.length;
      setActiveSuggestion(prev => e.key === 'ArrowDown' ? (prev + 1) % count : (prev - 1 + count) % count);
    } else if (e.key === 'Escape') {
      if (dropdownVisible) {
        e.preventDefault();
        closeSuggestions();
      } else if (activeTab) {
        setInputUrl(activeTab.url === 'about:blank' || activeTab.url === '' ? '' : activeTab.url);
        inputRef.current?.blur();
      }
    }
  };

  useEffect(() => {
    if (activeTab) {
      setInputUrl(activeTab.url === 'about:blank' || activeTab.url === '' ? '' : activeTab.url);
    }
  }, [activeTab?.url]);

  // Ctrl+L (or clicking the address bar's container) focuses and selects the input, the
  // way every mainstream browser does.
  useEffect(() => {
    const unsub = window.tora?.onFocusAddressBar(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return unsub;
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (dropdownVisible && activeSuggestion >= 0 && suggestions[activeSuggestion]) {
      pickSuggestion(suggestions[activeSuggestion]);
      return;
    }
    if (activeTab && inputUrl.trim()) {
      closeSuggestions();
      window.tora?.navigate(activeTab.id, inputUrl.trim());
      inputRef.current?.blur();
    }
  };

  const handleDownloadVideo = async () => {
    if (!activeTab || isExtracting) return;
    setIsExtracting(true);
    showToast("Recherche du flux vidéo en cours...", "info");
    try {
      const res = await window.tora?.downloadVideo(activeTab.url);
      if (res?.ok) {
        showToast("Téléchargement de la vidéo démarré !", "success");
      } else if (res?.message) {
        showToast(res.message, "error");
      } else {
        showToast("Téléchargement initié.", "success");
      }
    } catch {
      showToast("Échec de l'extraction de la vidéo", "error");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleToggleBookmark = () => {
    if (!activeTab) return;
    const willBeBookmarked = !activeTab.isBookmarked;
    const tabId = activeTab.id;
    window.tora?.toggleBookmark(tabId);
    showToast(
      willBeBookmarked ? "Ajouté aux favoris" : "Retiré des favoris",
      "success",
      willBeBookmarked ? undefined : { action: { label: 'Annuler', onClick: () => window.tora?.toggleBookmark(tabId) } },
    );
  };

  const isMock = typeof window.tora === 'undefined';

  const handleToggleBookmarkRef = useRef(handleToggleBookmark);
  handleToggleBookmarkRef.current = handleToggleBookmark;
  useEffect(() => {
    return window.tora?.onShortcutAction?.((action) => {
      if (action === 'bookmark') handleToggleBookmarkRef.current();
    });
  }, []);
  const isRealPage = !!activeTab && activeTab.url !== '' && !activeTab.url.startsWith('tora://');
  const domain = isRealPage ? (() => {
    try {
      return new URL(activeTab.url).hostname;
    } catch {
      return '';
    }
  })() : '';

  const security = activeTab?.securityState;
  const securityLabel = security === 'secure' ? 'Connexion sécurisée (HTTPS)'
    : security === 'insecure' ? 'Connexion non sécurisée (HTTP) : ne saisissez aucune information sensible'
    : security === 'broken' ? 'Certificat de sécurité invalide' : '';

  const totalBlocks = (activeTab?.blockedCount || 0) + (activeTab?.popupsBlockedCount || 0) + (activeTab?.redirectsBlockedCount || 0) + (activeTab?.scarewareBlockedCount || 0);
  const hasBlocks = totalBlocks > 0;
  
  const statsText = settings?.isAdBlockEnabled
    ? `${activeTab?.blockedCount || 0} pubs · ${activeTab?.popupsBlockedCount || 0} popups · ${activeTab?.redirectsBlockedCount || 0} redirections · ${activeTab?.scarewareBlockedCount || 0} alertes`
    : "Bloqueur désactivé (cliquez pour activer)";

  return (
    <div className="flex items-center h-14 px-5 bg-[#0A0A0A]/85 backdrop-blur-xl border-b border-white/10 app-region-no-drag shadow-lg">
      <div className="flex items-center space-x-2 mr-4 text-muted">
        <motion.button
          {...iconButtonPress}
          onClick={() => activeTab && window.tora?.goBack(activeTab.id)}
          disabled={!activeTab?.canGoBack || isMock}
          aria-label="Page précédente"
          className="disabled:opacity-40 hover:text-white transition-colors p-2 rounded-xl hover:bg-white/10"
        >
          <ArrowLeft size={16} strokeWidth={2.5} />
        </motion.button>
        <motion.button
          {...iconButtonPress}
          onClick={() => activeTab && window.tora?.goForward(activeTab.id)}
          disabled={!activeTab?.canGoForward || isMock}
          aria-label="Page suivante"
          className="disabled:opacity-40 hover:text-white transition-colors p-2 rounded-xl hover:bg-white/10"
        >
          <ArrowRight size={16} strokeWidth={2.5} />
        </motion.button>
        <motion.button
          {...iconButtonPress}
          onClick={() => activeTab && (activeTab.isLoading ? window.tora?.stopLoad(activeTab.id) : window.tora?.reload(activeTab.id))}
          disabled={!activeTab?.url || isMock}
          aria-label={activeTab?.isLoading ? 'Arrêter le chargement' : 'Recharger la page'}
          title={activeTab?.isLoading ? 'Arrêter' : 'Recharger'}
          className="disabled:opacity-40 hover:text-white transition-colors p-2 rounded-xl hover:bg-white/10"
        >
          {activeTab?.isLoading ? <X size={16} strokeWidth={2.5} /> : <RotateCw size={16} strokeWidth={2.5} />}
        </motion.button>
      </div>

      <div className="relative flex-1 min-w-[140px]">
      <form onSubmit={handleSubmit} className="w-full flex items-center h-10 px-4 bg-[#121212]/90 border border-[#5A5A5A] rounded-full text-[13px] text-ink focus-ring-within transition-all duration-200">
        <button
          type="button"
          aria-label={`Protections de Tora${hasBlocks ? ` : ${totalBlocks} élément${totalBlocks > 1 ? 's' : ''} bloqué${totalBlocks > 1 ? 's' : ''}` : ''}`}
          aria-haspopup="dialog"
          aria-expanded={privacyOpen}
          title={statsText}
          className="group relative flex items-center h-full mr-2.5 cursor-pointer z-20 bg-transparent border-0 p-0 text-left"
          onClick={() => setPrivacyOpen(open => !open)}
        >
          {settings?.isAdBlockEnabled ? (
            <div className={`flex items-center space-x-1.5 px-2.5 h-6 rounded-lg transition-colors ${hasBlocks ? 'bg-indigo-500/10 hover:bg-indigo-500/20' : 'bg-[#1A1A1A] hover:bg-[#2A2A2A]'}`}>
              <Shield size={13} className={hasBlocks ? 'text-indigo-400' : 'text-muted'} fill={hasBlocks ? 'currentColor' : 'none'} />
              {hasBlocks && (
                 <span className="text-[12px] font-semibold text-indigo-300">{totalBlocks}</span>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 px-2.5 h-6 rounded-lg hover:bg-[#1A1A1A] transition-colors">
              <Shield size={13} className="text-subtle" />
            </div>
          )}
        </button>

        {isRealPage && securityLabel && (
          <span
            role="img"
            aria-label={securityLabel}
            title={securityLabel}
            className={`flex items-center gap-1 mr-2 shrink-0 text-[12px] font-medium ${security === 'secure' ? 'text-muted' : security === 'insecure' ? 'text-amber-300' : 'text-red-400'}`}
          >
            {security === 'secure' ? <Lock size={13} aria-hidden="true" /> : security === 'insecure' ? <LockOpen size={13} aria-hidden="true" /> : <ShieldAlert size={13} aria-hidden="true" />}
            {security === 'insecure' && <span>Non sécurisé</span>}
          </span>
        )}

        {isRealPage && domain && (
          <SiteSettingsMenu domain={domain} security={security} />
        )}

        <input
          ref={inputRef}
          type="text"
          value={inputUrl}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onFocus={(e) => e.target.select()}
          onBlur={() => closeSuggestions()}
          role="combobox"
          aria-expanded={dropdownVisible}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={dropdownVisible && activeSuggestion >= 0 ? `${listboxId}-${activeSuggestion}` : undefined}
          autoComplete="off"
          spellCheck={false}
          aria-label="Adresse web ou recherche"
          placeholder="Rechercher ou entrer une adresse"
          className="w-full bg-transparent text-ink placeholder-muted focus:outline-none outline-none border-none ring-0 focus:ring-0 shadow-none px-1"
        />

        {inputUrl && (
          <button
            type="button"
            aria-label="Effacer la saisie"
            title="Effacer"
            onClick={() => { setInputUrl(''); inputRef.current?.focus(); }}
            className="p-1.5 mr-1 text-muted hover:text-ink hover:bg-white/10 rounded-md transition-colors shrink-0"
          >
            <X size={12} />
          </button>
        )}

        {isRealPage && (
          <button
            type="button"
            aria-label={activeTab?.isBookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            title={activeTab?.isBookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            onClick={handleToggleBookmark}
            className="p-2 mr-1 hover:bg-white/10 rounded-lg transition-colors shrink-0"
          >
            <Star size={14} className={activeTab?.isBookmarked ? 'text-amber-400' : 'text-muted hover:text-ink'} fill={activeTab?.isBookmarked ? 'currentColor' : 'none'} />
          </button>
        )}

        {isRealPage && settings?.isMediaDownloadEnabled !== false && (
          <button
            type="button"
            aria-label="Extraire et télécharger la vidéo"
            title={isExtracting ? "Extraction en cours..." : "Extraire & Télécharger la vidéo"}
            disabled={isExtracting}
            onClick={handleDownloadVideo}
            className={`p-1.5 mr-1 rounded-lg transition-colors shrink-0 group ${isExtracting ? 'bg-emerald-500/30' : 'hover:bg-emerald-500/20'}`}
          >
            {isExtracting ? (
              <Loader2 size={14} className="text-emerald-400 animate-spin" />
            ) : (
              <Download size={14} className="text-emerald-400 group-hover:scale-110 transition-transform" />
            )}
          </button>
        )}

        {isRealPage && (
          <button
            type="button"
            aria-label={activeTab?.isReaderMode ? 'Quitter le mode lecture' : 'Activer le mode lecture'}
            title="Mode lecture"
            onClick={() => window.tora?.toggleReaderMode()}
            className="p-1.5 mr-1 hover:bg-white/10 rounded-lg transition-colors shrink-0"
          >
            <BookOpen size={14} className={activeTab?.isReaderMode ? 'text-indigo-400' : 'text-muted hover:text-ink'} />
          </button>
        )}
      </form>

      {privacyOpen && (
        <PrivacyPanel tab={activeTab} settings={settings} domain={domain} onClose={() => setPrivacyOpen(false)} />
      )}

      {dropdownVisible && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute left-0 right-0 top-full mt-2 z-40 bg-[#121216] border border-[#5A5A5A] rounded-2xl shadow-2xl p-1.5 overflow-hidden"
        >
          {suggestions.map((sugg, i) => {
            const Icon = sugg.kind === 'search' ? Search : sugg.kind === 'bookmark' ? Star : sugg.kind === 'history' ? Clock : Globe;
            return (
              <div
                key={`${sugg.kind}-${sugg.url}`}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === activeSuggestion}
                // mousedown (not click) + preventDefault: keeps focus in the input so blur doesn't close the list first
                onMouseDown={(e) => { e.preventDefault(); pickSuggestion(sugg); }}
                onMouseEnter={() => setActiveSuggestion(i)}
                className={`flex items-center gap-3 px-3 h-10 rounded-xl cursor-pointer ${i === activeSuggestion ? 'bg-white/10' : ''}`}
              >
                <Icon size={14} className={sugg.kind === 'bookmark' ? 'text-amber-400 shrink-0' : 'text-muted shrink-0'} aria-hidden="true" />
                <span className="text-[13px] text-ink truncate">{sugg.title}</span>
                {sugg.kind !== 'search' && sugg.title !== sugg.url && (
                  <span className="text-[12px] text-subtle truncate ml-auto max-w-[45%] font-mono">{sugg.url.replace(/^https?:\/\//, '')}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>

      <div className="flex items-center space-x-4 ml-6">
        {activeTab?.container && (
          <span
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[12px] font-medium text-ink"
            style={{ borderColor: activeTab.container.color, backgroundColor: `${activeTab.container.color}22` }}
            title="Cet onglet a ses propres cookies, séparés de vos autres onglets"
          >
            <Boxes size={13} aria-hidden="true" style={{ color: activeTab.container.color }} /> {activeTab.container.name}
          </span>
        )}
        {settings?.isPrivateWindow && (
          <span className="flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-indigo-500/15 border border-indigo-400/40 text-[12px] font-medium text-indigo-200" title="Historique, cookies et données de sites sont effacés à la fermeture de cette fenêtre">
            <EyeOff size={13} aria-hidden="true" /> Navigation privée
          </span>
        )}
        <button 
          type="button"
          aria-label="Menu principal"
          aria-expanded={menuOpen}
          className={`p-1.5 rounded-lg transition-colors ${menuOpen ? 'text-white bg-white/10' : 'text-muted hover:text-ink hover:bg-white/10'}`}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <Menu size={18} strokeWidth={2.5} />
        </button>
      </div>

      {settings?.isVerticalTabsEnabled && (
        <div className="ml-2 -mr-4">
          <WindowControls />
        </div>
      )}
    </div>
  );
}
