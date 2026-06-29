export const EASE_STANDARD: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_EXIT: [number, number, number, number] = [0.4, 0, 1, 1];
export const EASE_EMPHASIZED: [number, number, number, number] = [0.2, 0.85, 0.25, 1];

export const MOTION_DURATION = {
  fast: 0.16,
  base: 0.24,
  slow: 0.34
} as const;

export const VIEWPORT_ONCE = { once: true, margin: "-8px" } as const;
