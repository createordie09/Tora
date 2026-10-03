import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useModalA11y } from '../hooks/useModalA11y';
import { useVideoDownload } from '../hooks/useVideoDownload';
import { Container } from '../types';
import { 
  Plus, EyeOff, Printer, FileDown, Code, Undo2, Boxes, Info, 
  Layers, 
  Star, 
  History, 
  Download, 
  Lock, 
  Moon, 
  Puzzle, 
  Camera, 
  Copy, 
  QrCode, 
  Tv, 
  Film,
  UserCheck, 
  ZoomIn, 
  Settings, 
  Terminal, 
  LogOut, 
  X,
  Compass
} from 'lucide-react';
import { TabData } from '../types';

interface MainMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: TabData;
  onOpenQrCode?: () => void;
  onOpenFakePersona?: () => void;
}


function MenuRow({ icon: Icon, label, shortcut, onClick }: { icon: React.ComponentType<{ size?: number }>; label: string; shortcut?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
    >
      <div className="flex items-center space-x-3">
        <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-indigo-400 group-hover:border-indigo-500/40 transition-colors">
          <Icon size={14} />
        </div>
        <span className="text-[13px] font-medium text-ink group-hover:text-white">{label}</span>
      </div>
      {shortcut && <span className="text-[12px] text-subtle font-mono group-hover:text-muted">{shortcut}</span>}
    </button>
  );
}

export default function MainMenuModal({
  isOpen,
  onClose,
  activeTab,
  onOpenQrCode,
  onOpenFakePersona,
}: MainMenuModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, isOpen, onClose);
  const { extract, isExtracting } = useVideoDownload();
  const isRealPage = !!activeTab?.url && !activeTab.url.startsWith('tora://');
  const [containers, setContainers] = useState<Container[]>([]);
  useEffect(() => {
    if (isOpen) Promise.resolve(window.tora?.getContainers()).then(c => setContainers(c || [])).catch(() => setContainers([]));
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal Tora"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[620px] bg-surface-1/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Compass size={17} />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-white tracking-wide font-display">
                    Menu Tora
                  </h2>
                  <p className="text-[12px] text-muted">Navigation, outils et préférences</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[12px] font-medium text-muted bg-white/5 px-2 py-0.5 rounded border border-white/10">
                  ESC
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fermer le menu"
                  className="p-1.5 rounded-lg text-muted hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* 2-Column Body */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 max-h-[75vh] overflow-y-auto">
              {/* Left Column: Navigation & Pages */}
              <div className="flex flex-col space-y-1">
                <span className="text-[12px] font-semibold text-muted uppercase tracking-wider px-2 py-1 mb-1">
                  Navigation & Pages
                </span>

                <button
                  type="button"
                  onClick={() => { window.tora?.createTab(); onClose(); }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-indigo-400 group-hover:border-indigo-500/40 transition-colors">
                      <Plus size={14} />
                    </div>
                    <span className="text-[13px] font-medium text-ink group-hover:text-white">Nouvel onglet</span>
                  </div>
                  <span className="text-[12px] text-subtle font-mono group-hover:text-muted">Ctrl+T</span>
                </button>

                <button
                  type="button"
                  onClick={() => { window.tora?.createNewWindow(); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-indigo-400 group-hover:border-indigo-500/40 transition-colors mr-3">
                    <Layers size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-ink group-hover:text-white">Nouvelle fenêtre</span>
                </button>

                <MenuRow icon={EyeOff} label="Nouvelle fenêtre privée" shortcut="Ctrl+Maj+N" onClick={() => { window.tora?.createPrivateWindow(); onClose(); }} />
                {containers.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { window.tora?.createContainerTab(c.id); onClose(); }}
                    className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center mr-3">
                      <Boxes size={14} style={{ color: c.color }} aria-hidden="true" />
                    </div>
                    <span className="text-[13px] font-medium text-ink group-hover:text-white">Nouvel onglet — {c.name}</span>
                  </button>
                ))}
                <MenuRow icon={Undo2} label="Rouvrir l'onglet fermé" shortcut="Ctrl+Maj+T" onClick={() => { window.tora?.reopenClosedTab(); onClose(); }} />

                <div className="my-1.5 border-t border-white/5" />

                <MenuRow icon={Printer} label="Imprimer…" shortcut="Ctrl+P" onClick={() => { window.tora?.printPage(); onClose(); }} />
                <MenuRow icon={FileDown} label="Enregistrer en PDF…" onClick={() => { window.tora?.savePagePdf(); onClose(); }} />
                <MenuRow icon={FileDown} label="Enregistrer la page sous…" shortcut="Ctrl+S" onClick={() => { window.tora?.savePageHtml(); onClose(); }} />
                <MenuRow icon={Code} label="Afficher le code source" shortcut="Ctrl+U" onClick={() => { window.tora?.viewSource(); onClose(); }} />

                <div className="my-1.5 border-t border-white/5" />

                <MenuRow icon={Info} label="À propos de Tora" onClick={() => { window.tora?.createTab('tora://about'); onClose(); }} />

                <div className="my-1.5 border-t border-white/5" />

                <button
                  type="button"
                  onClick={() => { window.tora?.createTab('tora://bookmarks'); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-amber-400 group-hover:border-amber-500/40 transition-colors mr-3">
                    <Star size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-ink group-hover:text-white">Favoris</span>
                </button>

                <button
                  type="button"
                  onClick={() => { window.tora?.createTab('tora://history'); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-indigo-400 group-hover:border-indigo-500/40 transition-colors mr-3">
                    <History size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-ink group-hover:text-white">Historique</span>
                </button>

                <button
                  type="button"
                  onClick={() => { window.tora?.createTab('tora://downloads'); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-emerald-400 group-hover:border-emerald-500/40 transition-colors mr-3">
                    <Download size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-ink group-hover:text-white">Téléchargements</span>
                </button>

                <button
                  type="button"
                  onClick={() => { window.tora?.createTab('tora://passwords'); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-indigo-400 group-hover:border-indigo-500/40 transition-colors mr-3">
                    <Lock size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-ink group-hover:text-white">Mots de passe</span>
                </button>

                <button
                  type="button"
                  onClick={() => { window.tora?.createTab('tora://focus'); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-indigo-400 group-hover:border-indigo-500/40 transition-colors mr-3">
                    <Moon size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-ink group-hover:text-white">Mode Focus</span>
                </button>

                <button
                  type="button"
                  onClick={() => { window.tora?.createTab('tora://extensions'); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-indigo-400 group-hover:border-indigo-500/40 transition-colors mr-3">
                    <Puzzle size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-ink group-hover:text-white">Protections & Extensions</span>
                </button>
              </div>

              {/* Right Column: Tools & System */}
              <div className="flex flex-col space-y-1">
                <span className="text-[12px] font-semibold text-muted uppercase tracking-wider px-2 py-1 mb-1">
                  Outils & Système
                </span>

                <button
                  type="button"
                  onClick={() => { window.tora?.capturePage('save'); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-indigo-400 group-hover:border-indigo-500/40 transition-colors mr-3">
                    <Camera size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-ink group-hover:text-white">Capturer la page (PNG)</span>
                </button>

                <button
                  type="button"
                  onClick={() => { window.tora?.capturePage('clipboard'); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-indigo-400 group-hover:border-indigo-500/40 transition-colors mr-3">
                    <Copy size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-ink group-hover:text-white">Copier la capture d'écran</span>
                </button>

                <button
                  type="button"
                  onClick={() => { onOpenQrCode?.(); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-indigo-400 group-hover:border-indigo-500/40 transition-colors mr-3">
                    <QrCode size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-ink group-hover:text-white">Code QR de la page</span>
                </button>

                <button
                  type="button"
                  onClick={() => { window.tora?.triggerPip(); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-indigo-400 group-hover:border-indigo-500/40 transition-colors mr-3">
                    <Tv size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-ink group-hover:text-white">Image dans l'image (PiP)</span>
                </button>

                {isRealPage && (
                  <MenuRow
                    icon={Film}
                    label={isExtracting ? 'Extraction de la vidéo…' : 'Télécharger la vidéo de la page'}
                    onClick={() => { extract(activeTab?.url); onClose(); }}
                  />
                )}

                <button
                  type="button"
                  onClick={() => { onOpenFakePersona?.(); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/30 transition-all group"
                >
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mr-3">
                    <UserCheck size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-indigo-300 group-hover:text-indigo-200">Générer une fausse identité</span>
                </button>

                {/* Zoom control item */}
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 border border-white/5 my-1">
                  <div className="flex items-center space-x-3">
                    <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted">
                      <ZoomIn size={14} />
                    </div>
                    <span className="text-[13px] font-medium text-ink">Zoom</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      aria-label="Réduire le zoom"
                      onClick={() => window.tora?.zoomOut()}
                      className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 text-muted hover:text-white transition-colors"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      aria-label="Réinitialiser le zoom"
                      onClick={() => window.tora?.zoomReset()}
                      className="text-[12px] font-mono px-1.5 py-0.5 rounded hover:bg-white/10 text-white"
                    >
                      {Math.round(100 + (activeTab?.zoomLevel || 0) * 20)}%
                    </button>
                    <button
                      type="button"
                      aria-label="Agrandir le zoom"
                      onClick={() => window.tora?.zoomIn()}
                      className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 text-muted hover:text-white transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="my-1 border-t border-white/5" />

                <button
                  type="button"
                  onClick={() => { window.tora?.createTab('tora://settings'); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-indigo-400 group-hover:border-indigo-500/40 transition-colors mr-3">
                    <Settings size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-ink group-hover:text-white">Paramètres</span>
                </button>

                <button
                  type="button"
                  onClick={() => { window.tora?.openDevTools(); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted group-hover:text-indigo-400 group-hover:border-indigo-500/40 transition-colors mr-3">
                    <Terminal size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-ink group-hover:text-white">Outils de développement</span>
                </button>

                <button
                  type="button"
                  onClick={() => { window.tora?.quitApp(); onClose(); }}
                  className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-all group"
                >
                  <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mr-3">
                    <LogOut size={14} />
                  </div>
                  <span className="text-[13px] font-medium text-red-400 group-hover:text-red-300">Quitter Tora</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
