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

// The three sizes must show the same picture: proportions within 2%.
export const ASPECT_TOLERANCE = 0.02

// Photos more extreme than 4:1 either way are refused. At such shapes, rounding
// to whole pixels could break the proportion check above.
export const MAX_ASPECT = 4
