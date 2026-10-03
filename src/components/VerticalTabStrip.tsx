import { Plus, X, Volume2, VolumeX, Pin } from 'lucide-react';
import { useState, useEffect, DragEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TabData } from '../types';
import Favicon from './Favicon';
import { handleTabKeyDown } from '../lib/tabKeys';
import TabContextMenu from './TabContextMenu';
import { useModalA11y } from '../hooks/useModalA11y';
import { popIn, tabPress, buttonPress, SPRING } from '../lib/motion';

interface VerticalTabStripProps {
  tabs: TabData[];
  activeTabId: string | null;
}

export default function VerticalTabStrip({ tabs, activeTabId }: VerticalTabStripProps) {
  const isMock = typeof window.tora === 'undefined';
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [colorMenu, setColorMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);

  useEffect(() => {
    if (!activeTabId) return;
    document.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeTabId)}"]`)
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeTabId, tabs.length]);

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

  return (
    <div className="flex flex-col w-[232px] h-full bg-surface-0/90 backdrop-blur-xl border-r border-white/5 shrink-0 app-region-drag select-none">
      <div className="h-12 flex items-center px-4 shrink-0">
        <span className="text-[13px] font-semibold tracking-wider text-indigo-400/90 font-display">TORA</span>
      </div>

      <div className="px-2 pb-2 shrink-0 app-region-no-drag">
        <motion.button
          type="button"
          {...buttonPress}
          aria-label="Ouvrir un nouvel onglet"
          title="Nouvel onglet (Ctrl+T)"
          onClick={() => window.tora?.createTab()}
          disabled={isMock}
          className="w-full h-8 flex items-center justify-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-muted hover:text-white transition-colors text-[12px] font-medium disabled:opacity-50 shadow-sm"
        >
          <Plus size={14} /> Nouvel onglet
        </motion.button>
      </div>

      <div 
        role="tablist" 
        aria-label="Onglets ouverts"
        className="flex-1 overflow-y-auto no-scrollbar px-2 space-y-1 app-region-no-drag"
      >
        <AnimatePresence initial={false}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <motion.div
              key={tab.id}
              layout
              initial={{ opacity: 0, scale: 0.95, x: -4 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95, x: -4, transition: { duration: 0.12 } }}
              transition={{ layout: SPRING.bouncy, duration: 0.18 }}
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
              className={`group relative flex items-center h-9 rounded-xl
                ${dragOverId === tab.id && dragId && dragId !== tab.id ? 'ring-1 ring-inset ring-white/20' : ''}
                ${dragId === tab.id ? 'opacity-40' : ''}
                ${isActive ? 'text-white' : 'text-muted hover:bg-white/5 hover:text-ink'}`}
            >
              {tab.container && (
                <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full z-10" style={{ backgroundColor: tab.container.color }} aria-hidden="true" />
              )}
              {isActive && (
                <motion.div
                  layoutId="verticalActiveTabIndicator"
                  className="absolute inset-0 bg-[#1F1F23] border border-white/10 rounded-xl z-0"
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
                onKeyDown={(e) => handleTabKeyDown(e, tab.id, tabs.map(t => t.id), true)}
                className={`relative z-10 flex items-center w-full h-full min-w-0 pl-2.5 ${tab.isAudible ? 'pr-14' : 'pr-9'} rounded-xl cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400`}
              >
                {tab.groupColor && <div className="w-[3px] h-4 rounded-full mr-2 shrink-0" style={{ backgroundColor: tab.groupColor }} />}

                {tab.isLoading ? (
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse mr-2 shrink-0" />
                ) : tab.isSuspended ? (
                  <div className="w-3.5 h-3.5 mr-2 shrink-0 rounded-sm bg-white/5 flex items-center justify-center" title="Onglet suspendu (RAM libérée)">
                    <div className="w-1.5 h-1.5 rounded-full border border-white/40" />
                  </div>
                ) : (
                  <Favicon src={tab.favicon} size={14} className="mr-2 shrink-0" />
                )}

                {tab.isPinned && <Pin size={11} className="mr-1.5 text-muted shrink-0" aria-hidden="true" />}
                <span className={`flex-1 text-[12px] font-medium truncate ${tab.isSuspended ? 'opacity-50' : ''}`}>
                  {tab.title || 'Nouvel onglet'}
                </span>
              </motion.div>

              {/* Mouse-only shortcuts, hidden from assistive tech (ARIA tabs hold no buttons): the keyboard uses Suppr (close) and the tab context menu (mute). */}
              {tab.isAudible && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  aria-label={tab.isMuted ? "Rétablir le son de l'onglet" : "Couper le son de l'onglet"}
                  title={tab.isMuted ? "Son coupé (cliquer pour réactiver)" : "Audio en cours (cliquer pour couper)"}
                  onClick={() => window.tora?.toggleTabMute(tab.id)}
                  className={`absolute right-8 z-20 p-1.5 rounded hover:bg-white/10 transition-colors ${tab.isMuted ? 'text-muted' : 'text-indigo-400'}`}
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
                  className={`absolute right-1.5 z-20 p-1.5 rounded-md hover:bg-white/10 transition-colors focus-visible:opacity-100
                    ${isActive ? 'opacity-100 text-muted hover:text-white' : 'opacity-0 group-hover:opacity-100 text-subtle hover:text-ink'}`}
                >
                  <X size={12} />
                </button>
              )}
            </motion.div>
          );
        })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {colorMenu && tabs.some(t => t.id === colorMenu.tabId) && (
          <TabContextMenu x={colorMenu.x} y={colorMenu.y} tab={tabs.find(t => t.id === colorMenu.tabId)!} tabs={tabs} onClose={() => setColorMenu(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

