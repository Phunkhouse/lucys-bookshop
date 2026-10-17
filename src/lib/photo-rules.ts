// The numbers behind photo uploads (spec 6.9 and 10), shared by the browser,
// which makes three sizes of every photo, and the server, which checks them.

export const RENDITIONS = ['thumb', 'medium', 'large'] as const
export type Rendition = (typeof RENDITIONS)[number]

export const MAX_FILE_BYTES = 2 * 1024 * 1024

// Longest edge of each size, in pixels. A smaller original is not enlarged, so
// smaller is fine.
export const MAX_LONG_EDGE: Record<Rendition, number> = {
  thumb: 480,
  medium: 960,
  large: 1600,
}

// Each size must be what the shared calculation (computeSizes) gives for the
// large one, give or take a pixel for rounding. The shop writes each photo's
// srcset from that calculation, so the files have to match it.
export const SIZE_TOLERANCE_PX = 1

// Photos more extreme than 4:1 either way are refused. At such shapes, rounding
// to whole pixels could break the proportion check above.
export const MAX_ASPECT = 4
