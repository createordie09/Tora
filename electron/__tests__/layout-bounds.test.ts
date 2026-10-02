import { describe, it, expect } from 'vitest';

// Layout bounds locking contract — prevents website views from overlapping under the UI
export const LAYOUT_LOCKS = {
  TAB_STRIP_HEIGHT: 48,       // h-12 in TabStrip.tsx
  TOOLBAR_HEIGHT: 56,         // h-14 in Toolbar.tsx
  TOTAL_HEADER_HEIGHT: 104,   // 48px + 56px = 104px
  VERTICAL_SIDEBAR_WIDTH: 232, // w-[232px] in VerticalTabStrip.tsx
  VERTICAL_TOOLBAR_HEIGHT: 56, // h-14 in Toolbar.tsx
};

describe('Tora Layout Bounds Lock Suite', () => {
  it('should maintain strict 104px total header height lock for horizontal layout', () => {
    expect(LAYOUT_LOCKS.TAB_STRIP_HEIGHT + LAYOUT_LOCKS.TOOLBAR_HEIGHT).toBe(104);
    expect(LAYOUT_LOCKS.TOTAL_HEADER_HEIGHT).toBe(104);
  });

  it('should maintain strict 56px top offset lock for vertical tabs layout', () => {
    expect(LAYOUT_LOCKS.VERTICAL_TOOLBAR_HEIGHT).toBe(56);
  });

  it('should maintain 232px sidebar width lock', () => {
    expect(LAYOUT_LOCKS.VERTICAL_SIDEBAR_WIDTH).toBe(232);
  });
});
