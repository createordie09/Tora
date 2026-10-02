import type { KeyboardEvent } from 'react';

/**
 * WAI-ARIA tabs keyboard model: ←/→ (or ↑/↓ for vertical lists) move to the neighbouring
 * tab and activate it, Home/End jump to the ends, Enter/Espace activate, Suppr closes.
 */
export function handleTabKeyDown(
  e: KeyboardEvent<HTMLElement>,
  tabId: string,
  orderedIds: string[],
  vertical: boolean,
) {
  if (e.target !== e.currentTarget) return; // ignore keys coming from the nested close/mute buttons
  const index = orderedIds.indexOf(tabId);
  const prevKey = vertical ? 'ArrowUp' : 'ArrowLeft';
  const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
  let target: number | null = null;

  if (e.key === nextKey) target = (index + 1) % orderedIds.length;
  else if (e.key === prevKey) target = (index - 1 + orderedIds.length) % orderedIds.length;
  else if (e.key === 'Home') target = 0;
  else if (e.key === 'End') target = orderedIds.length - 1;

  if (target !== null) {
    e.preventDefault();
    const id = orderedIds[target];
    window.tora?.switchTab(id);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`)?.focus();
    });
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    window.tora?.switchTab(tabId);
  } else if (e.key === 'Delete') {
    e.preventDefault();
    window.tora?.closeTab(tabId);
  }
}
