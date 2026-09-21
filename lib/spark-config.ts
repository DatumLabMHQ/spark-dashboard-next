/**
 * Spark buyback policy constants.
 *
 * The buyback threshold ("Buyback Threshold" reference line in Sam
 * MacPherson's Aug 2026 tweet) is an OFF-CHAIN policy number computed
 * monthly by Phoenix Labs and posted to the Sky forum under
 * https://forum.skyeco.com/t/spark-subdao-proxy-management-updates/27734
 *
 * Formula (from that thread):
 *   Target = max(Capital Reserve, Operational Reserve)
 *     - Capital Reserve  = highest 3-mo RRC / 0.9 + $1M
 *     - Operational Res. = max(12-mo trailing opex, annualized last-month opex)
 *   Monthly buyback     = (Current Proxy Value - Target) * 0.25
 *
 * Add a new entry each month when the update is posted. The page reads
 * the most recent effectiveFrom entry as the "current" threshold.
 */
export interface BuybackThresholdEntry {
  effectiveFrom: string     // YYYY-MM-DD, first day the target applies
  targetUSD: number          // "Target" (Buyback Threshold on the chart)
  standardBuybackRate: number // Fraction of cushion returned per month (0.25 = 25%)
  monthlyBudgetUSD: number   // The month's TWAP dollar budget (Phoenix Labs post)
  sourceUrl: string
  note?: string
}

export const BUYBACK_THRESHOLDS: BuybackThresholdEntry[] = [
  {
    effectiveFrom: "2026-08-15",
    targetUSD: 32_400_000,
    standardBuybackRate: 0.25,
    monthlyBudgetUSD: 1_750_000,
    sourceUrl: "https://x.com/hexonaut/status/",
    note: 'Restart after settlement-backlog delay. Hexonaut: "1.75m USD going out over the next month in a TWAP." Compensates for a few months of delayed payments.',
  },
]

export function currentThreshold(now = new Date()): BuybackThresholdEntry {
  const ymd = now.toISOString().slice(0, 10)
  const active = [...BUYBACK_THRESHOLDS]
    .filter((e) => e.effectiveFrom <= ymd)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))
  return active[0] ?? BUYBACK_THRESHOLDS[BUYBACK_THRESHOLDS.length - 1]
}
