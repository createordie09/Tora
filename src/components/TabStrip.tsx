import { Plus, X, Volume2, VolumeX } from 'lucide-react';
import { useState, useRef, DragEvent } from 'react';
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

  return (
    <div 
      className="flex h-12 bg-[#050505]/90 backdrop-blur-xl border-b border-white/5 app-region-drag px-2 py-2 items-center"
      onDoubleClick={(e) => { if (e.target === e.currentTarget) window.tora?.maximizeWindow(); }}
    >
      <div 
        role="tablist" 
        aria-label="Onglets ouverts"
        className="flex flex-1 overflow-x-auto no-scrollbar items-center gap-1.5 min-w-0"
        onDoubleClick={(e) => { if (e.target === e.currentTarget) window.tora?.maximizeWindow(); }}
      >
      <AnimatePresence initial={false}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <motion.div
            key={tab.id}
            layout
            {...tabPress}
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
            onClick={() => window.tora?.switchTab(tab.id)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                e.stopPropagation();
                window.tora?.closeTab(tab.id);
              }
            }}
            onKeyDown={(e) => handleTabKeyDown(e, tab.id, tabs.map(t => t.id), false)}
            onContextMenu={(e) => { e.preventDefault(); setColorMenu({ x: e.clientX, y: e.clientY, tabId: tab.id }); }}
            role="tab"
            data-tab-id={tab.id}
            tabIndex={isActive || !tabs.some(t => t.id === activeTabId) ? 0 : -1}
            aria-selected={isActive}
            aria-label={`${tab.title || 'Onglet'}${tab.isPinned ? ' (épinglé)' : ''}${tab.container ? ` (conteneur ${tab.container.name})` : ''}`}
            className={`group relative flex items-center h-8 ${tab.isPinned ? 'w-10 px-0 justify-center' : 'min-w-[130px] max-w-[220px] px-3'} cursor-pointer transition-colors app-region-no-drag rounded-full shrink-0 focus-visible:ring-2 focus-visible:ring-indigo-400
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

            <div className={`relative z-10 flex items-center w-full min-w-0 ${tab.isPinned ? 'justify-center' : ''}`}>
              {tab.groupColor && (
                <div className="w-1.5 h-1.5 rounded-full mr-2 shrink-0" style={{ backgroundColor: tab.groupColor }} />
              )}

            {tab.isLoading ? (
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse mr-2 shrink-0" />
            ) : tab.isSuspended ? (
              <div className="w-3.5 h-3.5 mr-2 shrink-0 rounded-sm bg-[#222] flex items-center justify-center" title="Onglet suspendu (RAM libérée)">
                <div className="w-1.5 h-1.5 rounded-full border border-[#949494]" />
              </div>
            ) : (
              <Favicon src={tab.favicon} size={14} className={`${tab.isPinned ? '' : 'mr-2 '}shrink-0`} />
            )}
            
            <span className={`${tab.isPinned ? 'hidden ' : ''}flex-1 text-[11px] font-medium truncate ${tab.isAudible ? 'mr-1' : 'mr-4'} ${tab.isSuspended ? 'opacity-50' : ''}`}>
              {tab.title || 'New Tab'}
            </span>

            {tab.isAudible && (
              <button
                type="button"
                aria-label={tab.isMuted ? "Rétablir le son de l'onglet" : "Couper le son de l'onglet"}
                title={tab.isMuted ? "Son coupé (cliquer pour réactiver)" : "Audio en cours (cliquer pour couper)"}
                onClick={(e) => {
                  e.stopPropagation();
                  window.tora?.toggleTabMute(tab.id);
                }}
                className={`${tab.isPinned ? 'hidden ' : ''}p-1.5 mr-4 rounded hover:bg-white/10 transition-colors shrink-0 ${tab.isMuted ? 'text-muted' : 'text-indigo-400'}`}
              >
                {tab.isMuted ? <VolumeX size={12} /> : <Volume2 size={12} className="animate-pulse" />}
              </button>
            )}
            
              <button
                type="button"
                aria-label={`Fermer l'onglet ${tab.title || ''}`.trim()}
                title="Fermer l'onglet"
                onClick={(e) => {
                  e.stopPropagation();
                  window.tora?.closeTab(tab.id);
                }}
                className={`${tab.isPinned ? 'hidden ' : ''}absolute right-1 p-1.5 rounded-md hover:bg-white/10 transition-colors
                  ${isActive ? 'opacity-100 text-muted hover:text-white' : 'opacity-0 group-hover:opacity-100 text-muted hover:text-ink'}`}
              >
                <X size={12} />
              </button>
            </div>
          </motion.div>
        );
      })}
      </AnimatePresence>
      
      <button
        type="button"
        aria-label="Ouvrir un nouvel onglet"
        title="Nouvel onglet (Ctrl+T)"
        onClick={() => window.tora?.createTab()}
        disabled={isMock}
        className="h-8 w-8 flex items-center justify-center shrink-0 rounded-full hover:bg-[#161616] text-muted hover:text-ink transition-colors app-region-no-drag disabled:opacity-50"
      >
        <Plus size={16} />
      </button>
      </div>

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
