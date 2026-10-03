import { Plus, X, Volume2, VolumeX } from 'lucide-react';
import { useState, useEffect, DragEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TabData } from '../types';
import WindowControls from './WindowControls';
import Favicon from './Favicon';
import { handleTabKeyDown } from '../lib/tabKeys';
import TabContextMenu from './TabContextMenu';
import { useModalA11y } from '../hooks/useModalA11y';
import { popIn, tabPress, SPRING } from '../lib/motion';

interface TabStripProps {
  tabs: TabData[];
  activeTabId: string | null;
}

export default function TabStrip({ tabs, activeTabId }: TabStripProps) {
  const isMock = typeof window.tora === 'undefined';
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [colorMenu, setColorMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const ids = tabs.map(t => t.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    window.tora?.reorderTabs(ids);
    setDragId(null);
    setDragOverId(null);
  };

  // Keep the active tab visible when there are more tabs than room.
  useEffect(() => {
    if (!activeTabId) return;
    document.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeTabId)}"]`)
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeTabId, tabs.length]);

  return (
    <div 
      className="flex h-12 bg-surface-0/90 backdrop-blur-xl border-b border-white/5 app-region-drag px-2 py-2 items-center select-none"
      onDoubleClick={(e) => { if (e.target === e.currentTarget) window.tora?.maximizeWindow(); }}
    >
      <div
        role="tablist"
        aria-label="Onglets ouverts"
        className="flex overflow-x-auto no-scrollbar items-center gap-1.5 min-w-0"
        onDoubleClick={(e) => { if (e.target === e.currentTarget) window.tora?.maximizeWindow(); }}
      >
      <AnimatePresence initial={false}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const showAudio = !!tab.isAudible && !tab.isPinned;
        return (
          // The wrapper owns drag/drop, mouse gestures and the action buttons; the inner
          // `role="tab"` element holds no interactive children (valid ARIA tabs).
          <motion.div
            key={tab.id}
            layout
            initial={{ opacity: 0, scale: 0.88, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 4, transition: { duration: 0.12 } }}
            transition={{ layout: SPRING.bouncy, duration: 0.2 }}
            draggable
            onDragStart={() => setDragId(tab.id)}
            onDragOver={(e: DragEvent) => { e.preventDefault(); if (dragOverId !== tab.id) setDragOverId(tab.id); }}
            onDragLeave={() => setDragOverId(prev => (prev === tab.id ? null : prev))}
            onDrop={() => handleDrop(tab.id)}
            onDragEnd={() => { setDragId(null); setDragOverId(null); }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                e.stopPropagation();
                window.tora?.closeTab(tab.id);
              }
            }}
            onContextMenu={(e) => { e.preventDefault(); setColorMenu({ x: e.clientX, y: e.clientY, tabId: tab.id }); }}
            role="presentation"
            className={`group relative flex items-center h-8 app-region-no-drag rounded-full
              ${tab.isPinned ? 'w-10 shrink-0' : 'shrink min-w-[96px] max-w-[220px] basis-[220px]'}
              ${dragOverId === tab.id && dragId && dragId !== tab.id ? 'ring-1 ring-inset ring-white/20' : ''}
              ${dragId === tab.id ? 'opacity-40' : ''}
              ${isActive ? 'text-white' : 'text-muted hover:bg-white/5 hover:text-ink'}`}
          >
            {tab.container && (
              <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full z-10" style={{ backgroundColor: tab.container.color }} aria-hidden="true" />
            )}
            {isActive && (
              <motion.div
                layoutId="activeTabIndicator"
                className="absolute inset-0 bg-[#1F1F23] border border-white/10 rounded-full z-0"
                transition={{ type: 'spring', stiffness: 450, damping: 30 }}
              />
            )}

            <motion.div
              {...tabPress}
              role="tab"
              data-tab-id={tab.id}
              tabIndex={isActive || !tabs.some(t => t.id === activeTabId) ? 0 : -1}
              aria-selected={isActive}
              aria-label={`${tab.title || 'Onglet'}${tab.isPinned ? ' (épinglé)' : ''}${tab.container ? ` (conteneur ${tab.container.name})` : ''}`}
              onClick={() => window.tora?.switchTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, tab.id, tabs.map(t => t.id), false)}
              className={`relative z-10 flex items-center h-full w-full min-w-0 cursor-pointer rounded-full ${tab.isPinned ? 'justify-center px-0' : `pl-3 ${showAudio ? 'pr-14' : 'pr-8'}`} focus-visible:ring-2 focus-visible:ring-indigo-400`}
            >
              {tab.groupColor && (
                <div className="w-1.5 h-1.5 rounded-full mr-2 shrink-0" style={{ backgroundColor: tab.groupColor }} />
              )}

              {tab.isLoading ? (
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse mr-2 shrink-0" />
              ) : tab.isSuspended ? (
                <div className="w-3.5 h-3.5 mr-2 shrink-0 rounded-sm bg-surface-3 flex items-center justify-center" title="Onglet suspendu (RAM libérée)">
                  <div className="w-1.5 h-1.5 rounded-full border border-[#949494]" />
                </div>
              ) : (
                <Favicon src={tab.favicon} size={14} className={`${tab.isPinned ? '' : 'mr-2 '}shrink-0`} />
              )}

              <span className={`${tab.isPinned ? 'hidden ' : ''}flex-1 text-[12px] font-medium truncate ${tab.isSuspended ? 'opacity-50' : ''}`}>
                {tab.title || 'Nouvel onglet'}
              </span>
            </motion.div>

            {/* Mouse-only shortcuts, hidden from assistive tech (ARIA tabs hold no buttons): the keyboard uses Suppr (close) and the tab context menu (mute). */}
            {showAudio && (
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                aria-label={tab.isMuted ? "Rétablir le son de l'onglet" : "Couper le son de l'onglet"}
                title={tab.isMuted ? "Son coupé (cliquer pour réactiver)" : "Audio en cours (cliquer pour couper)"}
                onClick={() => window.tora?.toggleTabMute(tab.id)}
                className={`absolute right-7 z-20 p-1.5 rounded hover:bg-white/10 transition-colors ${tab.isMuted ? 'text-muted' : 'text-indigo-400'}`}
              >
                {tab.isMuted ? <VolumeX size={12} /> : <Volume2 size={12} className="animate-pulse" />}
              </button>
            )}

            {!tab.isPinned && (
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                aria-label={`Fermer l'onglet ${tab.title || ''}`.trim()}
                title="Fermer l'onglet"
                onClick={() => window.tora?.closeTab(tab.id)}
                className={`absolute right-1 z-20 p-1.5 rounded-md hover:bg-white/10 transition-colors focus-visible:opacity-100
                  ${isActive ? 'opacity-100 text-muted hover:text-white' : 'opacity-0 group-hover:opacity-100 text-muted hover:text-ink'}`}
              >
                <X size={12} />
              </button>
            )}
          </motion.div>
        );
      })}
      </AnimatePresence>
      </div>

      <button
        type="button"
        aria-label="Ouvrir un nouvel onglet"
        title="Nouvel onglet (Ctrl+T)"
        onClick={() => window.tora?.createTab()}
        disabled={isMock}
        className="h-8 w-8 ml-1.5 flex items-center justify-center shrink-0 rounded-full hover:bg-surface-1 text-muted hover:text-ink transition-colors app-region-no-drag disabled:opacity-50"
      >
        <Plus size={16} />
      </button>
      <div className="flex-1 self-stretch min-w-[16px]" onDoubleClick={() => window.tora?.maximizeWindow()} />

      <div className="ml-2">
        <WindowControls />
      </div>

      <AnimatePresence>
        {colorMenu && tabs.some(t => t.id === colorMenu.tabId) && (
          <TabContextMenu x={colorMenu.x} y={colorMenu.y} tab={tabs.find(t => t.id === colorMenu.tabId)!} tabs={tabs} onClose={() => setColorMenu(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
