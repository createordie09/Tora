import { useReducedMotion } from 'motion/react';

// ===== 2026 Spring Physics Tokens =====
// Apple iOS / macOS style spring dynamics for ultra-fluid, organic feel instead of rigid linear curves.

export const SPRING = {
  tactile: { type: 'spring', stiffness: 500, damping: 30, mass: 0.8 },
  bouncy: { type: 'spring', stiffness: 420, damping: 24, mass: 1 },
  smooth: { type: 'spring', stiffness: 320, damping: 28, mass: 1 },
  gentle: { type: 'spring', stiffness: 220, damping: 22, mass: 1 },
} as const;

export const DURATION = {
  instant: 0.08,
  fast: 0.12,
  base: 0.2,
  slow: 0.35,
} as const;

export const EASE = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
  in: [0.4, 0, 1, 1],
} as const;

// Reusable Motion Interactive Presets
export const buttonPress = {
  whileHover: { scale: 1.05, y: -1 },
  whileTap: { scale: 0.93 },
  transition: SPRING.tactile,
};

export const iconButtonPress = {
  whileHover: { scale: 1.12, rotate: 2 },
  whileTap: { scale: 0.88, rotate: -2 },
  transition: SPRING.tactile,
};

export const tabPress = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.96 },
  transition: SPRING.bouncy,
};

export const cardHover = {
  whileHover: { scale: 1.01, y: -3, boxShadow: '0 10px 30px -10px rgba(99, 102, 241, 0.2)' },
  whileTap: { scale: 0.98, y: 0 },
  transition: SPRING.smooth,
};

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.base, ease: EASE.out } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE.in } },
};

export const popIn = {
  initial: { opacity: 0, scale: 0.92, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: SPRING.bouncy },
  exit: { opacity: 0, scale: 0.94, y: -4, transition: { duration: DURATION.fast, ease: EASE.in } },
};

export const slideDown = {
  initial: { opacity: 0, y: -12 },
  animate: { opacity: 1, y: 0, transition: SPRING.smooth },
  exit: { opacity: 0, y: -8, transition: { duration: DURATION.fast, ease: EASE.in } },
};

export const slideUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: SPRING.smooth },
  exit: { opacity: 0, y: 12, transition: { duration: DURATION.fast, ease: EASE.in } },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1, transition: SPRING.bouncy },
  exit: { opacity: 0, scale: 0.93, transition: { duration: DURATION.fast, ease: EASE.in } },
};

export const tabItem = {
  initial: { opacity: 0, scale: 0.88, y: 4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: SPRING.bouncy },
  exit: { opacity: 0, scale: 0.88, y: 4, transition: { duration: DURATION.fast, ease: EASE.in } },
};

export function useMotionPreference() {
  const reduce = useReducedMotion();
  return { reduce };
}

/**
 * Returns accessible motion variants that respect system prefers-reduced-motion preferences.
 * When reduced motion is requested by the OS, spatial transforms (scale/y/rotate) are disabled
 * while retaining clean opacity crossfades.
 */
export function getAccessibleMotion<T extends Record<string, any>>(preset: T, shouldReduce: boolean | null): T {
  if (!shouldReduce) return preset;

  const sanitized: any = { ...preset };
  if (sanitized.whileHover) {
    sanitized.whileHover = { opacity: 1 };
  }
  if (sanitized.whileTap) {
    sanitized.whileTap = { opacity: 0.85 };
  }
  if (sanitized.initial) {
    sanitized.initial = { opacity: 0 };
  }
  if (sanitized.animate) {
    sanitized.animate = { opacity: 1 };
  }
  return sanitized;
}

