import { useState, useEffect, useMemo, MouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HistoryEntry } from '../types';
import { Trash2, Search, X } from 'lucide-react';
import Favicon from './Favicon';
import { cardHover, buttonPress, popIn } from '../lib/motion';
import CardGridSkeleton from './CardGridSkeleton';
import InlineError from './InlineError';
import { useUndoableDelete } from '../hooks/useUndoableDelete';
import { useAutoReset } from '../hooks/useAutoReset';

function formatFriendlyDate(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfEntry = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfEntry) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  useAutoReset(confirmClear, false, () => setConfirmClear(false), 4000);
  const [error, setError] = useState(false);
  const undoableDelete = useUndoableDelete();

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.resolve(window.tora?.getHistory())
      .then(res => setHistory(res || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = (e: MouseEvent, entry: HistoryEntry) => {
    e.stopPropagation();
    undoableDelete(
      `history:${entry.id}`,
      "Entrée supprimée de l'historique",
      () => setHistory(prev => prev.filter(h => h.id !== entry.id)),
      () => setHistory(prev => [...prev, entry].sort((a, b) => b.timestamp - a.timestamp)),
      () => { window.tora?.deleteHistoryEntry(entry.id); },
    );
  };

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    await window.tora?.clearHistory();
    setHistory([]);
    setConfirmClear(false);
  };

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    const q = searchQuery.toLowerCase();
    return history.filter(h => (h.title && h.title.toLowerCase().includes(q)) || (h.url && h.url.toLowerCase().includes(q)));
  }, [history, searchQuery]);

  const grouped = useMemo(() => {
    return filteredHistory.reduce((acc, entry) => {
      const dateStr = formatFriendlyDate(entry.timestamp);
      if (!acc[dateStr]) acc[dateStr] = [];
      acc[dateStr].push(entry);
      return acc;
    }, {} as Record<string, HistoryEntry[]>);
  }, [filteredHistory]);

  return (
    <motion.div {...popIn} className="flex-1 overflow-y-auto bg-surface-0">
      <div className="max-w-5xl mx-auto px-10 py-16">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[28px] font-semibold text-white mb-1 font-display">Historique</h1>
            <p className="text-[13px] text-muted">Vos pages visitées récemment</p>
          </div>
          {history.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher..."
                  aria-label="Rechercher dans l'historique"
                  className="w-full h-9 pl-9 pr-8 bg-surface-1 border border-line-strong rounded-lg text-[12px] text-ink placeholder-subtle focus:outline-none focus:border-indigo-500/50"
                />
                <Search size={14} className="absolute left-3 top-2.5 text-subtle" aria-hidden="true" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Effacer la recherche"
                    className="absolute right-1.5 top-1.5 p-1 text-subtle hover:text-white"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {confirmClear && (
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="text-[12px] font-medium px-3 py-2 bg-surface-2 hover:bg-surface-3 rounded-lg border border-line text-muted transition-colors"
                >
                  Annuler
                </button>
              )}
              <motion.button
                type="button"
                {...buttonPress}
                onClick={handleClear}
                className={`text-[12px] font-medium px-3 py-2 rounded-lg border transition-colors shrink-0 ${
                  confirmClear
                    ? 'bg-red-700 hover:bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/30'
                    : 'bg-surface-1 hover:bg-red-500/10 border-line hover:border-red-500/30 text-muted hover:text-red-400'
                }`}
              >
                {confirmClear ? 'Confirmer ?' : 'Effacer tout'}
              </motion.button>
              <span className="sr-only" role="status">{confirmClear ? "Cliquez à nouveau pour effacer tout l'historique." : ''}</span>
            </div>
          )}
        </div>

        {loading ? (
          <CardGridSkeleton label="Chargement de l'historique…" />
        ) : error ? (
          <InlineError message="Impossible de charger l'historique." onRetry={load} />
        ) : history.length === 0 ? (
          <div className="py-20 text-center text-subtle text-[13px]">
            <p className="font-medium text-ink">Aucune page dans l'historique</p>
            <p className="mt-1">Les pages que vous visitez apparaîtront ici.</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="py-20 text-center text-subtle text-[13px]">Aucun résultat trouvé pour « {searchQuery} »</div>
        ) : (
          <div className="space-y-8">
            {Object.keys(grouped).map(date => (
              <div key={date}>
                <h2 className="text-[12px] text-muted mb-3 font-semibold uppercase tracking-wider">{date}</h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                  <AnimatePresence mode="popLayout">
                    {grouped[date].map(entry => (
                      <motion.div
                        key={entry.id}
                        layout
                        {...cardHover}
                        className="group relative rounded-xl bg-surface-1 border border-white/5 hover:border-indigo-500/20 focus-within:border-indigo-500/40 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => window.tora?.createTab(entry.url)}
                          aria-label={`Ouvrir ${entry.title || entry.url} dans un nouvel onglet`}
                          className="flex flex-col w-full p-3.5 text-left rounded-xl cursor-pointer"
                        >
                          <span className="flex items-start space-x-2.5 mb-2.5 pr-7">
                            <Favicon src={entry.favicon} size={16} />
                            <span className="text-[13px] font-medium text-ink group-hover:text-white line-clamp-2 break-words min-w-0">
                              {entry.title || entry.url}
                            </span>
                          </span>
                          <span className="text-[12px] text-subtle truncate font-mono">{entry.url}</span>
                        </button>
                        <motion.button
                          {...buttonPress}
                          type="button"
                          aria-label={`Supprimer « ${entry.title || entry.url} » de l'historique`}
                          title="Supprimer"
                          onClick={(e) => handleDelete(e, entry)}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 p-2 rounded-md text-muted hover:bg-white/10 hover:text-red-400 transition-all"
                        >
                          <Trash2 size={13} />
                        </motion.button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
