import { useState, useEffect, useMemo, MouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookmarkEntry } from '../types';
import { Trash2, Star, Search, X } from 'lucide-react';
import Favicon from './Favicon';
import { popIn, cardHover, buttonPress } from '../lib/motion';
import CardGridSkeleton from './CardGridSkeleton';
import InlineError from './InlineError';
import { useUndoableDelete } from '../hooks/useUndoableDelete';

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const undoableDelete = useUndoableDelete();

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.resolve(window.tora?.getBookmarks())
      .then(res => setBookmarks(res || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = (e: MouseEvent, bookmark: BookmarkEntry) => {
    e.stopPropagation();
    undoableDelete(
      `bookmark:${bookmark.id}`,
      'Favori supprimé',
      () => setBookmarks(prev => prev.filter(b => b.id !== bookmark.id)),
      () => setBookmarks(prev => [...prev, bookmark]),
      () => { window.tora?.deleteBookmark(bookmark.id); },
    );
  };

  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return bookmarks;
    const q = searchQuery.toLowerCase();
    return bookmarks.filter(b => (b.title && b.title.toLowerCase().includes(q)) || (b.url && b.url.toLowerCase().includes(q)));
  }, [bookmarks, searchQuery]);

  return (
    <motion.div {...popIn} className="flex-1 overflow-y-auto bg-[#050505]">
      <div className="max-w-5xl mx-auto px-10 py-16">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[28px] font-semibold text-white mb-1 font-display">Favoris</h1>
            <p className="text-[13px] text-muted">Pages que vous avez enregistrées</p>
          </div>
          {bookmarks.length > 0 && (
            <div className="relative w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher..."
                aria-label="Rechercher dans les favoris"
                className="w-full h-9 pl-9 pr-8 bg-[#121212] border border-[#5A5A5A] rounded-lg text-[12px] text-ink placeholder-subtle focus:outline-none focus:border-indigo-500/50"
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
          )}
        </div>

        {loading ? (
          <CardGridSkeleton label="Chargement des favoris…" />
        ) : error ? (
          <InlineError message="Impossible de charger les favoris." onRetry={load} />
        ) : bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted">
            <Star size={32} className="mb-4 opacity-50 text-indigo-400" strokeWidth={1.5} />
            <p className="text-[13px] font-medium text-ink">Aucun favori enregistré</p>
            <p className="text-[12px] text-subtle mt-1 text-center max-w-[280px]">
              Cliquez sur l'étoile dans la barre d'adresse pour enregistrer une page.
            </p>
          </div>
        ) : filteredBookmarks.length === 0 ? (
          <div className="py-20 text-center text-subtle text-[13px]">Aucun favori correspondant à « {searchQuery} »</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            <AnimatePresence mode="popLayout">
              {filteredBookmarks.map(b => (
                <motion.div
                  key={b.id}
                  layout
                  {...cardHover}
                  className="group relative rounded-xl bg-[#101014] border border-white/5 hover:border-indigo-500/20 focus-within:border-indigo-500/40 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => window.tora?.createTab(b.url)}
                    aria-label={`Ouvrir ${b.title || b.url} dans un nouvel onglet`}
                    className="flex flex-col w-full p-3.5 text-left rounded-xl cursor-pointer"
                  >
                    <span className="w-9 h-9 rounded-lg bg-[#161616] border border-[#242424] flex items-center justify-center mb-2.5 shrink-0">
                      <Favicon src={b.favicon} size={15} />
                    </span>
                    <span className="text-[12px] text-ink font-medium truncate pr-4">{b.title || b.url}</span>
                    <span className="text-[12px] text-subtle truncate mt-0.5 font-mono">{b.url}</span>
                  </button>
                  <motion.button
                    {...buttonPress}
                    type="button"
                    onClick={(e) => handleDelete(e, b)}
                    title="Supprimer"
                    aria-label="Supprimer ce favori"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 p-2 rounded-md text-muted hover:bg-white/10 hover:text-red-400 transition-all"
                  >
                    <Trash2 size={13} />
                  </motion.button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}
