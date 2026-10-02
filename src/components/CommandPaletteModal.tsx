import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, EyeOff, Printer, FileDown, Code, Undo2, Search, Shield, Settings, History, Download, Bookmark, Moon, Lock, Sparkles, Terminal, Camera, QrCode, Tv, UserCheck, Copy } from 'lucide-react';
import { popIn } from '../lib/motion';
import { useModalA11y } from '../hooks/useModalA11y';

interface CommandItem {
  id: string;
  title: string;
  category: string;
  icon: any;
  action: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenQrCode?: () => void;
  onOpenFakePersona?: () => void;
}

export default function CommandPaletteModal({ isOpen, onClose, onOpenQrCode, onOpenFakePersona }: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: CommandItem[] = [
    {
      id: 'newtab',
      title: 'Créer un nouvel onglet',
      category: 'Onglets',
      icon: Sparkles,
      action: () => { window.tora?.createTab(); onClose(); },
    },
    {
      id: 'settings',
      title: 'Ouvrir les Paramètres',
      category: 'Navigation',
      icon: Settings,
      action: () => { window.tora?.createTab('tora://settings'); onClose(); },
    },
    {
      id: 'history',
      title: 'Voir l\'Historique de navigation',
      category: 'Navigation',
      icon: History,
      action: () => { window.tora?.createTab('tora://history'); onClose(); },
    },
    {
      id: 'clear-data',
      title: 'Effacer les données de navigation…',
      category: 'Confidentialité',
      icon: History,
      action: () => { window.tora?.createTab('tora://settings'); onClose(); },
    },
    {
      id: 'about',
      title: 'À propos de Tora (version, mises à jour, licences)',
      category: 'Navigation',
      icon: Info,
      action: () => { window.tora?.createTab('tora://about'); onClose(); },
    },
    {
      id: 'private-window',
      title: 'Ouvrir une fenêtre de navigation privée',
      category: 'Confidentialité',
      icon: EyeOff,
      action: () => { window.tora?.createPrivateWindow(); onClose(); },
    },
    {
      id: 'reopen-tab',
      title: "Rouvrir l'onglet fermé",
      category: 'Onglets',
      icon: Undo2,
      action: () => { window.tora?.reopenClosedTab(); onClose(); },
    },
    {
      id: 'print',
      title: 'Imprimer la page',
      category: 'Page',
      icon: Printer,
      action: () => { window.tora?.printPage(); onClose(); },
    },
    {
      id: 'save-pdf',
      title: 'Enregistrer la page en PDF',
      category: 'Page',
      icon: FileDown,
      action: () => { window.tora?.savePagePdf(); onClose(); },
    },
    {
      id: 'view-source',
      title: 'Afficher le code source de la page',
      category: 'Page',
      icon: Code,
      action: () => { window.tora?.viewSource(); onClose(); },
    },
    {
      id: 'focus',
      title: 'Activer le Mode Focus',
      category: 'Productivité',
      icon: Moon,
      action: () => { window.tora?.createTab('tora://focus'); onClose(); },
    },
    {
      id: 'extensions',
      title: 'Protections & Extensions Chrome',
      category: 'Sécurité',
      icon: Shield,
      action: () => { window.tora?.createTab('tora://extensions'); onClose(); },
    },
    {
      id: 'downloads',
      title: 'Gestionnaire de Téléchargements',
      category: 'Outils',
      icon: Download,
      action: () => { window.tora?.createTab('tora://downloads'); onClose(); },
    },
    {
      id: 'passwords',
      title: 'Coffre-fort de Mots de passe',
      category: 'Sécurité',
      icon: Lock,
      action: () => { window.tora?.createTab('tora://passwords'); onClose(); },
    },
    {
      id: 'bookmarks',
      title: 'Afficher les Favoris',
      category: 'Navigation',
      icon: Bookmark,
      action: () => { window.tora?.createTab('tora://bookmarks'); onClose(); },
    },
    {
      id: 'devtools',
      title: 'Ouvrir les Outils de Développement',
      category: 'Développeur',
      icon: Terminal,
      action: () => { window.tora?.openDevTools(); onClose(); },
    },
    {
      id: 'capture-page-save',
      title: 'Capturer la page (Fichier PNG)',
      category: 'Outils',
      icon: Camera,
      action: () => { window.tora?.capturePage('save'); onClose(); },
    },
    {
      id: 'capture-page-clipboard',
      title: 'Copier la capture d\'écran de la page',
      category: 'Outils',
      icon: Copy,
      action: () => { window.tora?.capturePage('clipboard'); onClose(); },
    },
    {
      id: 'qrcode',
      title: 'Afficher le Code QR de la page',
      category: 'Outils',
      icon: QrCode,
      action: () => { onOpenQrCode?.(); onClose(); },
    },
    {
      id: 'pip',
      title: 'Activer le mode Image dans l\'image (PiP)',
      category: 'Médias',
      icon: Tv,
      action: () => { window.tora?.triggerPip(); onClose(); },
    },
    {
      id: 'fake-persona',
      title: 'Générer une fausse identité (Fake Persona)',
      category: 'Confidentialité',
      icon: UserCheck,
      action: () => { onOpenFakePersona?.(); onClose(); },
    },
  ];

  const filtered = commands.filter(c => c.title.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (!isOpen || filtered.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, filtered, selectedIndex]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, isOpen, onClose);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-md" onClick={onClose}>
        <motion.div
          {...popIn}
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Palette de commandes"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xl bg-[#121216]/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-2xl"
        >
          <div className="flex items-center px-4 py-3 border-b border-white/10">
            <Search size={18} className="text-indigo-400 mr-3 shrink-0" aria-hidden="true" />
            <input
              type="text"
              aria-label="Rechercher une commande"
              placeholder="Tapez une commande ou une action (Ctrl + K)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-white text-[14px] outline-none placeholder-subtle"
            />
            <span className="text-[10px] font-medium text-muted bg-white/5 px-2 py-1 rounded-md border border-white/10">ESC</span>
          </div>

          <div role="listbox" aria-label="Commandes disponibles" className="max-h-80 overflow-y-auto p-2 space-y-1">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-muted text-[13px]">
                Aucune commande trouvée pour "{query}".
              </div>
            ) : (
              filtered.map((item, idx) => {
                const Icon = item.icon;
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors group text-left ${
                      isSelected ? 'bg-indigo-500/20 border-indigo-500/30' : 'border-transparent hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-indigo-500/30 border border-indigo-500/40 text-indigo-300' : 'bg-white/5 border border-white/10 text-muted'
                      }`}>
                        <Icon size={16} />
                      </div>
                      <span className={`text-[13px] font-medium transition-colors ${isSelected ? 'text-white' : 'text-ink'}`}>
                        {item.title}
                      </span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">
                      {item.category}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
