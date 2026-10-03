import { useEffect } from 'react';

/**
 * Two-step confirmations ("Confirmer ?") fall back to their idle state after `ms`.
 * The timer is cleared on every change and on unmount, so a stale timeout can never cancel a newer confirmation.
 */
export function useAutoReset<T>(value: T, idle: T, reset: () => void, ms: number) {
  useEffect(() => {
    if (value === idle) return;
    const timer = setTimeout(reset, ms);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}
