// Chrome (tab strip + toolbar) heights. Must stay in sync with TAB_STRIP_HEIGHT /
// TOOLBAR_HEIGHT in electron/main.ts, which positions the page view below this header.
export const TAB_STRIP_HEIGHT = 48; // h-12
export const TOOLBAR_HEIGHT = 56; // h-14

/** Top offset (px) of the overlay region, below the header, in horizontal / vertical-tabs mode. */
export const CONTENT_TOP = { horizontal: TAB_STRIP_HEIGHT + TOOLBAR_HEIGHT, vertical: TOOLBAR_HEIGHT } as const;
/** Banner/find-bar offset: content top + 8px gap. */
export const OVERLAY_TOP = { horizontal: CONTENT_TOP.horizontal + 8, vertical: CONTENT_TOP.vertical + 6 } as const;
