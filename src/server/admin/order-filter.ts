export const STAGE_FILTERS = [
  'all',
  'awaiting_payment',
  'expired',
  'paid',
  'shipped',
  'completed',
  'cancelled',
  'refunded',
] as const
export type StageFilter = (typeof STAGE_FILTERS)[number]

// The filter comes from the URL, so anything can arrive: unknown values mean "all".
export function parseStageFilter(value: unknown): StageFilter {
  return STAGE_FILTERS.find((filter) => filter === value) ?? 'all'
}
