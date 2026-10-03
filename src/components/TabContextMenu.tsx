import { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { RotateCw, Copy, Pin, PinOff, Volume2, VolumeX, X, XCircle, ArrowRightToLine, Undo2 } from 'lucide-react';
import { TabData } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';
import { popIn } from '../lib/motion';

const GROUP_COLORS = [
  { value: '#F87171', label: 'Rouge' },
  { value: '#FBBF24', label: 'Ambre' },
  { value: '#34D399', label: 'Émeraude' },
  { value: '#60A5FA', label: 'Bleu' },
  { value: '#C084FC', label: 'Violet' },
];

interface TabContextMenuProps {
  x: number;
  y: number;
  tab: TabData;
  tabs: TabData[];
  onClose: () => void;
}

const itemClass = 'w-full flex items-center gap-3 px-3 h-9 rounded-lg text-left text-[13px] text-ink hover:bg-white/10 focus-visible:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors';

/** Right-click menu of a tab: page actions, closing options, pinning and the group colour. */
export default function TabContextMenu({ x, y, tab, tabs, onClose }: TabContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(ref, true, onClose);

  // The page view sits above the interface: freeze it behind the menu like the other overlays.
  useEffect(() => {
    window.tora?.setOverlayActive('tab-menu', true);
    return () => { window.tora?.setOverlayActive('tab-menu', false); };
  }, []);

  const index = tabs.findIndex(t => t.id === tab.id);
  const hasUnpinnedToRight = tabs.slice(index + 1).some(t => !t.isPinned);
  const hasOtherUnpinned = tabs.some(t => t.id !== tab.id && !t.isPinned);
  const isRealPage = !!tab.url && !tab.url.startsWith('tora://');
  const run = (action: () => void) => () => { action(); onClose(); };

  // Keep the menu inside the window.
  const left = Math.max(8, Math.min(x, window.innerWidth - 248));
  const top = Math.max(8, Math.min(y, window.innerHeight - 380));

  // Rendered in <body>: the tab strip has a backdrop filter, which would trap a fixed menu inside it
  // (clipped and painted under the toolbar).
  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} aria-hidden="true" />
      <motion.div
        {...popIn}
        ref={ref}
        role="menu"
        aria-label={`Actions de l'onglet ${tab.title || ''}`.trim()}
        style={{ left, top, originX: 0, originY: 0 }}
        className="fixed z-[61] w-60 bg-surface-2 border border-line-strong rounded-xl shadow-2xl p-1.5"
      >
        <button type="button" role="menuitem" className={itemClass} disabled={!isRealPage} onClick={run(() => window.tora?.reload(tab.id))}>
          <RotateCw size={14} aria-hidden="true" /> Recharger
        </button>
        <button type="button" role="menuitem" className={itemClass} disabled={!tab.url} onClick={run(() => window.tora?.duplicateTab(tab.id))}>
          <Copy size={14} aria-hidden="true" /> Dupliquer
        </button>
        <button type="button" role="menuitem" className={itemClass} onClick={run(() => window.tora?.pinTab(tab.id, !tab.isPinned))}>
          {tab.isPinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
          {tab.isPinned ? 'Détacher' : 'Épingler'}
        </button>
        {tab.isAudible && (
          <button type="button" role="menuitem" className={itemClass} onClick={run(() => window.tora?.toggleTabMute(tab.id))}>
            {tab.isMuted ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
            {tab.isMuted ? 'Réactiver le son' : "Couper le son de l'onglet"}
          </button>
        )}

        <div className="my-1 border-t border-white/10" role="separator" />

        <button type="button" role="menuitem" className={itemClass} onClick={run(() => window.tora?.closeTab(tab.id))}>
          <X size={14} aria-hidden="true" /> Fermer
        </button>
        <button type="button" role="menuitem" className={itemClass} disabled={!hasOtherUnpinned} onClick={run(() => window.tora?.closeOtherTabs(tab.id))}>
          <XCircle size={14} aria-hidden="true" /> Fermer les autres onglets
        </button>
        <button type="button" role="menuitem" className={itemClass} disabled={!hasUnpinnedToRight} onClick={run(() => window.tora?.closeTabsToRight(tab.id))}>
          <ArrowRightToLine size={14} aria-hidden="true" /> Fermer les onglets à droite
        </button>
        <button type="button" role="menuitem" className={itemClass} onClick={run(() => window.tora?.reopenClosedTab())}>
          <Undo2 size={14} aria-hidden="true" /> Rouvrir l'onglet fermé
        </button>

        <div className="my-1 border-t border-white/10" role="separator" />

        <div role="group" aria-label="Couleur de l'onglet" className="flex items-center gap-1.5 px-3 py-2">
          {GROUP_COLORS.map(c => (
            <button
              type="button"
              key={c.value}
              title={c.label}
              aria-label={`Couleur ${c.label}`}
              aria-pressed={tab.groupColor === c.value}
              onClick={run(() => window.tora?.setTabGroupColor(tab.id, c.value))}
              className={`w-6 h-6 rounded-full border-2 hover:scale-110 transition-transform ${tab.groupColor === c.value ? 'border-white' : 'border-transparent'}`}
              style={{ backgroundColor: c.value }}
            />
          ))}
          <button
            type="button"
            title="Aucune couleur"
            aria-label="Supprimer la couleur"
            onClick={run(() => window.tora?.setTabGroupColor(tab.id, null))}
            className="w-6 h-6 rounded-full border border-line-strong flex items-center justify-center hover:bg-surface-3 transition-colors ml-1"
          >
            <X size={11} className="text-muted" />
          </button>
        </div>
      </motion.div>
    </>,
    document.body,
  );
}
