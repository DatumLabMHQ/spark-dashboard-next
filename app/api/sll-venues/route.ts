/* eslint-disable @typescript-eslint/no-explicit-any -- vendored route handler.
 * Copied verbatim from sparklend-dashboard so the Spark corrections travel with it. These parse
 * untyped third-party JSON and on-chain logs; hand-retyping them here would risk a regression in
 * numbers already verified in production.
 * NEW code in this app must not use `any` - the kit's rule stands everywhere else.
 */
import { NextResponse } from "next/server"

/**
 * Spark Liquidity Layer composition, first-party.
 *
 * PREVIOUS SOURCE WAS WRONG. This route used to read DefiLlama's
 * `/protocol/spark-liquidity-layer` per-token `tokensInUsd` map. That endpoint
 * only sees ERC-20 balances, so it missed whole positions: RLUSD ($251.7M),
 * Anchorage ($210.0M) and Uniswap V4 LP ($150.1M) were absent, and Morpho read
 * $22.4M against an actual $289.1M. An analysis built on it concluded SparkLend
 * was 62.8% of the book with "under 1% external", when Spark publishes 47.6%
 * and roughly half external.
 *
 * Spark's own allocation table at data.spark.finance (Block Analitica) is the
 * authority and is key-free. Verified 2026-08-31: this route reproduces the
 * published dashboard to within 0.01pp.
 */

export const dynamic = "force-dynamic"
export const maxDuration = 30

const STAR = "https://spark2-api.blockanalitica.com"
const TTL = 30 * 60_000
let cache: any = null
let cacheTime = 0

/**
 * Block Analitica's `protocol` field mapped to a display label, and whether the
 * venue is Spark's own product or somebody else's. `arkis` is what the API calls
 * the position Spark's own UI labels "Spark Prime".
 */
const VENUES: Record<string, { label: string; own: boolean; color: string }> = {
  sparklend: { label: "SparkLend", own: true, color: "#F5A623" },
  PSM3: { label: "PSM3", own: true, color: "#22D3EE" },
  arkis: { label: "Spark Prime", own: true, color: "#E879F9" },
  morpho: { label: "Morpho", own: false, color: "#3B82F6" },
  ripple: { label: "Ripple RLUSD", own: false, color: "#94A3B8" },
  paypal: { label: "PayPal PYUSD", own: false, color: "#1E40AF" },
  anchorage: { label: "Anchorage", own: false, color: "#CBD5E1" },
  uniswap: { label: "Uniswap V4", own: false, color: "#EC4899" },
  aave: { label: "Aave V3", own: false, color: "#8B5CF6" },
  curve: { label: "Curve", own: false, color: "#10B981" },
  fluid: { label: "Fluid", own: false, color: "#06B6D4" },
  maple: { label: "Maple", own: false, color: "#F97316" },
  ethena: { label: "Ethena", own: false, color: "#A3A3A3" },
  idle: { label: "Idle", own: true, color: "#6B7280" },
}

const venue = (p: string) =>
  VENUES[p] ?? { label: p, own: false, color: "#6B7280" }

export async function GET() {
  if (cache && Date.now() - cacheTime < TTL) return NextResponse.json(cache)

  try {
    const [aum, summary, hist] = await Promise.all([
      fetch(`${STAR}/sparkstar/sll/aum/`, { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(`aum ${r.status}`)
        return r.json()
      }),
      fetch(`${STAR}/sparkstar/sll/`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      // days_ago=9999 returns the full history back to 2023-05-08. Values between
      // 366 and 9998 return a single empty row, so do not "tidy" this number.
      fetch(`${STAR}/sparkstar/sll/aum/historic/?days_ago=9999`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])

    const rows: Array<{ network: string; protocol: string; asset_symbol: string; aum_usd: string }> =
      Array.isArray(aum) ? aum : []

    let totalUsd = 0
    for (const r of rows) totalUsd += Number(r.aum_usd || 0)

    // Per-position rows, one per network + protocol + asset.
    const positions = rows
      .map((r) => {
        const v = venue(r.protocol)
        const usd = Number(r.aum_usd || 0)
        // Avoid "Anchorage on Anchorage" / "RLUSD on Ripple RLUSD", and keep the
        // four separate PSM3 rows distinguishable by naming their network.
        const sym = String(r.asset_symbol || "")
        const inLabel = v.label.toUpperCase().includes(sym.toUpperCase())
        const net = r.network && r.network !== "ethereum" ? ` (${r.network})` : ""
        return {
          label: inLabel ? `${v.label}${net}` : `${sym} on ${v.label}${net}`,
          symbol: r.asset_symbol,
          network: r.network,
          category: v.label,
          own: v.own,
          usd,
          share: totalUsd > 0 ? (usd / totalUsd) * 100 : 0,
          color: v.color,
        }
      })
      .filter((p) => p.usd > 0)
      .sort((a, b) => b.usd - a.usd)

    const byCategory: Record<string, { category: string; own: boolean; usd: number; share: number; color: string }> = {}
    for (const p of positions) {
      byCategory[p.category] ??= {
        category: p.category,
        own: p.own,
        usd: 0,
        share: 0,
        color: p.color,
      }
      byCategory[p.category].usd += p.usd
    }
    for (const c of Object.values(byCategory)) {
      c.share = totalUsd > 0 ? (c.usd / totalUsd) * 100 : 0
    }
    const categories = Object.values(byCategory).sort((a, b) => b.usd - a.usd)

    const ownShare = categories.filter((c) => c.own).reduce((s, c) => s + c.share, 0)
    const externalShare = categories.filter((c) => !c.own).reduce((s, c) => s + c.share, 0)
    const sparkLendShare = categories.find((c) => c.category === "SparkLend")?.share ?? 0

    const byNetwork: Record<string, number> = {}
    for (const p of positions) byNetwork[p.network] = (byNetwork[p.network] || 0) + p.usd

    // Per-network history, same source as everything else on the page, so the
    // headline card and the chart cannot disagree. Rows are one per calendar
    // date with a column per network, matching ByChainAreaChart's contract.
    const byDate = new Map<string, Record<string, number>>()
    const netMax: Record<string, number> = {}
    for (const r of Array.isArray(hist) ? hist : []) {
      const d = String(r.date)
      const net = String(r.network || "unknown")
      const usd = Number(r.aum_usd || 0)
      if (!byDate.has(d)) byDate.set(d, {})
      const row = byDate.get(d)!
      row[net] = (row[net] || 0) + usd
      if (row[net] > (netMax[net] || 0)) netMax[net] = row[net]
    }
    // Drop networks that never held anything worth plotting.
    const histChains = Object.entries(netMax)
      .filter(([, v]) => v > 100_000)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k)

    const histDaily = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, row]) => {
        const out: Record<string, number> = {
          date: Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 1000),
        }
        let t = 0
        for (const c of histChains) {
          out[c] = row[c] || 0
          t += out[c]
        }
        out.total = t
        return out
      })

    const last = histDaily[histDaily.length - 1]
    const prior30 = histDaily[histDaily.length - 31]
    const change30d =
      last && prior30 && prior30.total > 0
        ? { delta: last.total - prior30.total, pct: ((last.total - prior30.total) / prior30.total) * 100 }
        : null

    const result = {
      totalUsd,
      history: { chains: histChains, daily: histDaily },
      change30d,
      asOf: summary?.date ?? new Date().toISOString().slice(0, 10),
      categories,
      positions,
      ownShare,
      externalShare,
      sparkLendShare,
      networks: Object.entries(byNetwork)
        .map(([network, usd]) => ({ network, usd, share: totalUsd > 0 ? (usd / totalUsd) * 100 : 0 }))
        .sort((a, b) => b.usd - a.usd),
      meta: {
        source: `${STAR}/sparkstar/sll/aum/`,
        note:
          "Spark's own allocation table. SparkLend is the single largest destination for the Liquidity Layer's capital, so roughly half of what Sky lends Spark is redeployed into Spark's own lending market rather than into external venues. The remainder sits with Morpho, Ripple, PayPal, Anchorage and Uniswap.",
      },
    }

    cache = result
    cacheTime = Date.now()
    const res = NextResponse.json(result)
    res.headers.set("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600")
    return res
  } catch (err: any) {
    console.error("SLL venues API error:", err.message?.slice(0, 120))
    if (cache) return NextResponse.json(cache)
    return NextResponse.json(
      { error: "Failed to fetch SLL composition", details: err.message },
      { status: 500 }
    )
  }
}
