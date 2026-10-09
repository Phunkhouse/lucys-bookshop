export const STATUS_FILTERS = [
  'all',
  'available',
  'reserved',
  'sold',
  'hidden',
] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

// The filter comes from the URL, so anything can arrive: unknown values mean "all".
export function parseStatusFilter(value: unknown): StatusFilter {
  return STATUS_FILTERS.find((filter) => filter === value) ?? 'all'
}
