import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '../components/Toast';

const UNDO_DELAY = 6000;

/**
 * Optimistic delete with an "Annuler" toast. The UI is updated immediately; the real
 * deletion (`commit`) only runs once the undo window has elapsed — or when the page
 * is left, so nothing is lost.
 */
export function useUndoableDelete() {
  const { showToast } = useToast();
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; commit: () => void }>());

  const flush = useCallback((key: string) => {
    const entry = pending.current.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.current.delete(key);
    entry.commit();
  }, []);

  useEffect(() => () => {
    Array.from(pending.current.keys()).forEach(flush);
  }, [flush]);

  return useCallback((key: string, message: string, remove: () => void, restore: () => void, commit: () => void) => {
    remove();
    const timer = setTimeout(() => flush(key), UNDO_DELAY);
    pending.current.set(key, { timer, commit });
    showToast(message, 'info', {
      duration: UNDO_DELAY,
      action: {
        label: 'Annuler',
        onClick: () => {
          const entry = pending.current.get(key);
          if (!entry) return;
          clearTimeout(entry.timer);
          pending.current.delete(key);
          restore();
        },
      },
    });
  }, [flush, showToast]);
}
