import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * Spark financials, sourced first-party.
 *
 * WHY THIS ROUTE NO LONGER USES DEFILLAMA
 * ---------------------------------------
 * DefiLlama's `spark-liquidity-layer` fees adapter serves an INCOMPLETE capture
 * of its own source. Verified 2026-08-31 against Spark's Dune table and Spark's
 * own API:
 *
 *   - It captured 66.5% of July's gross yield and 69.6% of August's.
 *   - Three July days match Spark's records to the dollar and 17 are short by
 *     >$100K, so it is the same table, partially read.
 *   - Its served series swings 51.6% day over day where the source moves 4.5%.
 *     A $2.2B book cannot earn 5x more on one day than the next.
 *   - Netting a full day of funding cost against a partial day of yield turns a
 *     profit into a loss: DefiLlama shows -$649K for August where Spark's own
 *     accounting shows +$302K.
 *
 * Spark's public data hub (data.spark.finance, built by Block Analitica) exposes
 * the same numbers through open, key-free APIs. August SLL gross reads
 * $8,018,602 there against the Dune query's $8,018,330.
 *
 * WHAT ELSE WAS DELETED
 * ---------------------
 * This route previously ran an on-chain Distribution Rewards mint scan with a
 * $2M per-mint cap heuristic, a flat-rate amortisation, a USDS/DAI snapshot
 * ratio applied to history to "match Blockworks", and background flash-loan and
 * liquidation log scans. All of it is gone:
 *   - Distribution Rewards come from the API as a product line, and match
 *     Blockworks to within 1% on every settled quarter.
 *   - SparkLend's own take comes from the API directly.
 *   - Flash loan and liquidation fees are immaterial. Blockworks books $11 of
 *     liquidation fees for the whole of Q3 2026 and $0 of flash loan fees.
 *     Hundreds of lines of scanning and a pile of RPC calls for a rounding error.
 *
 * The DefiLlama figures are still fetched, but only to SHOW the discrepancy in
 * the UI. They are never used as the reported number.
 */

const FIN = "https://spark.data.blockanalitica.com"
const STAR = "https://spark2-api.blockanalitica.com"
const LLAMA = "https://api.llama.fi"

const CACHE_TTL = 30 * 60_000
let cache: any = null
let cacheTime = 0

const n = (x: any) => (x === null || x === undefined ? 0 : Number(x))

async function json(url: string) {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

/** DefiLlama daily series -> { "YYYY-MM": total }. Comparison only. */
async function llamaMonthly(slug: string, dataType: string) {
  try {
    const d = await json(`${LLAMA}/summary/fees/${slug}?dataType=${dataType}`)
    const out: Record<string, number> = {}
    for (const [ts, v] of d.totalDataChart || []) {
      const m = new Date(ts * 1000).toISOString().slice(0, 7)
      out[m] = (out[m] || 0) + n(v)
    }
    return out
  } catch {
    return {}
  }
}

export async function GET() {
  if (cache && Date.now() - cacheTime < CACHE_TTL) {
    const r = NextResponse.json(cache)
    r.headers.set("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600")
    return r
  }

  try {
    const [categories, sll, buyback, llamaRev, llamaFees] = await Promise.all([
      json(`${FIN}/v1/financials/categories/historic/`),
      json(`${STAR}/sparkstar/sll/?days_ago=365`),
      json(`${FIN}/v1/financials/buyback/historic/`),
      llamaMonthly("spark-liquidity-layer", "dailyRevenue"),
      llamaMonthly("spark-liquidity-layer", "dailyFees"),
    ])

    // ---- monthly income statement, by product ----
    const byMonth: Record<string, any> = {}
    for (const row of categories.data || []) {
      const m = String(row.date).slice(0, 7)
      byMonth[m] ??= { month: m, products: {}, grossTotal: 0, netTotal: 0 }
      byMonth[m].products[row.product] = {
        gross: n(row.gross_returns),
        net: n(row.net_returns),
      }
      byMonth[m].grossTotal += n(row.gross_returns)
      byMonth[m].netTotal += n(row.net_returns)
    }

    const monthly = Object.values(byMonth)
      .sort((a: any, b: any) => a.month.localeCompare(b.month))
      .map((m: any) => {
        const sll = m.products.SLL ?? { gross: 0, net: 0 }
        return {
          ...m,
          takeRatePct: m.grossTotal > 0 ? (m.netTotal / m.grossTotal) * 100 : 0,
          sllGross: sll.gross,
          sllNet: sll.net,
          sllCost: sll.gross - sll.net,
          // How much a 1% mismeasurement of gross moves net. The whole point:
          // net is a thin residual, so this runs to 10x-36x.
          amplification: sll.net !== 0 ? Math.abs(sll.gross / sll.net) : null,
        }
      })

    // ---- daily spread: what Spark earns vs what it pays Sky ----
    const sllDaily = (sll.historic || []).map((r: any) => ({
      date: r.date,
      baseRatePct: n(r.base_rate) * 100,
      realApyPct: n(r.real_apy) * 100,
      spreadPct: n(r.spread) * 100,
      totalAssetsUsd: n(r.total_assets_usd),
    }))

    // ---- buyback ----
    const buybackDaily = (buyback.data || [])
      .map((r: any) => ({
        date: r.date,
        usdsSpent: n(r.daily_usds_spent),
        spkBought: n(r.daily_spk_bought),
        totalUsdsSpent: n(r.total_usds_spent),
        totalSpkBought: n(r.total_spk_bought),
        avgPrice: n(r.spk_average_price),
      }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date))

    // ---- three-source comparison on the SLL line ----
    // Kept deliberately visible rather than smoothed away. Spark and DefiLlama
    // read the same underlying table; the gap is DefiLlama's missing rows.
    const sourceComparison = monthly.slice(-13).map((m: any) => ({
      month: m.month,
      sparkGross: m.sllGross,
      sparkNet: m.sllNet,
      llamaGross: llamaFees[m.month] ?? null,
      llamaNet: llamaRev[m.month] ?? null,
      llamaCapturePct:
        llamaFees[m.month] && m.sllGross > 0
          ? (llamaFees[m.month] / m.sllGross) * 100
          : null,
    }))

    const latest = monthly[monthly.length - 1] ?? null
    const prior = monthly[monthly.length - 2] ?? null
    const spreadNow = sllDaily[sllDaily.length - 1] ?? null

    const result = {
      monthly,
      sllDaily,
      buybackDaily,
      sourceComparison,
      latest,
      prior,
      spreadNow,
      meta: {
        fetchedAt: new Date().toISOString(),
        // The current month is still accruing. Distribution Rewards settle as a
        // monthly off-chain rebate and lag: they match Blockworks to ~0% on
        // settled quarters but ran 70% below for Jul-Aug 2026 when first read.
        latestMonthIsPartial: true,
        sources: {
          incomeStatement: `${FIN}/v1/financials/categories/historic/`,
          spread: `${STAR}/sparkstar/sll/?days_ago=365`,
          buyback: `${FIN}/v1/financials/buyback/historic/`,
          comparison: `${LLAMA}/summary/fees/spark-liquidity-layer`,
        },
      },
    }

    cache = result
    cacheTime = Date.now()
    const r = NextResponse.json(result)
    r.headers.set("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600")
    return r
  } catch (error: any) {
    console.error("Financials API error:", error.message)
    if (cache) return NextResponse.json(cache)
    return NextResponse.json(
      { error: "Failed to fetch Spark financials", details: error.message },
      { status: 500 }
    )
  }
}
