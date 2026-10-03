import { useState, useEffect, useRef, FormEvent } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { OVERLAY_TOP } from '../lib/layout';
import { slideDown } from '../lib/motion';

interface FindBarProps {
  isVerticalTabsEnabled?: boolean;
}

export default function FindBar({ isVerticalTabsEnabled }: FindBarProps) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ matches: number; activeMatchOrdinal: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef('');
  queryRef.current = query;

  useEffect(() => {
    const unsub = window.tora?.onShowFindBar(() => {
      setVisible(true);
      window.tora?.setOverlayActive('find', true);
      // Reopening restores the previous search.
      if (queryRef.current) window.tora?.findInPage(queryRef.current);
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
    });
    return unsub;
  }, []);

  // Focus once the bar is actually mounted (a timeout can fire before it renders).
  useEffect(() => {
    if (visible) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [visible]);

  useEffect(() => {
    const unsub = window.tora?.onFindInPageResult((r) => setResult(r));
    return unsub;
  }, []);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible]);

  const close = () => {
    setVisible(false);
    setResult(null);
    window.tora?.setOverlayActive('find', false);
    window.tora?.stopFindInPage();
  };

  // Enter = next match, Maj+Entrée = previous (the first search runs as you type).
  const handleSubmit = (e: FormEvent) => { e.preventDefault(); };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (query) window.tora?.findInPageNext(query, !e.shiftKey);
    }
  };

  useEffect(() => {
    if (visible && query) window.tora?.findInPage(query);
    if (!query) setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          {...slideDown}
          className={`absolute right-4 z-50 flex items-center bg-surface-2 border border-line-strong rounded-lg shadow-2xl px-2 py-1.5 app-region-no-drag`} style={{ top: isVerticalTabsEnabled ? OVERLAY_TOP.vertical : OVERLAY_TOP.horizontal }}
        >
          <form onSubmit={handleSubmit} className="flex items-center">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Rechercher dans la page"
              placeholder="Rechercher dans la page"
              className="w-56 bg-transparent text-[13px] text-ink placeholder-subtle px-2"
            />
          </form>
          {result && (
            <span aria-live="polite" className="text-[12px] text-muted px-2 whitespace-nowrap">
              {result.matches > 0 ? `${result.activeMatchOrdinal}/${result.matches}` : '0/0'}
            </span>
          )}
          <button
            type="button"
            aria-label="Résultat précédent"
            title="Résultat précédent (Maj+Entrée)"
            onClick={() => query && window.tora?.findInPageNext(query, false)}
            className="p-1.5 text-muted hover:text-ink hover:bg-surface-3 rounded transition-colors"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            aria-label="Résultat suivant"
            title="Résultat suivant (Entrée)"
            onClick={() => query && window.tora?.findInPageNext(query, true)}
            className="p-1.5 text-muted hover:text-ink hover:bg-surface-3 rounded transition-colors"
          >
            <ChevronDown size={14} />
          </button>
          <button 
            type="button"
            aria-label="Fermer la recherche"
            title="Fermer la recherche (Échap)"
            onClick={close} 
            className="p-1.5 ml-1 text-muted hover:text-ink hover:bg-surface-3 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
