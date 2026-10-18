import { useFormatter } from 'next-intl'

// Formats minor units (1/100 of the currency). Whole crowns show without
// decimals ("189 Kč"), anything else with two ("189,50 Kč").
export function useMoney() {
  const format = useFormatter()
  return (minor: number, currency: string) => {
    const digits = minor % 100 === 0 ? 0 : 2
    return format.number(minor / 100, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  }
}
