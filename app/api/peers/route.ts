import { NextResponse } from "next/server"

/**
 * Peer lending market share on Ethereum. Uses each peer's DefiLlama
 * `chainTvls['Ethereum-borrowed']` daily series — the closest thing to
 * "outstanding loans" that DefiLlama exposes without a per-market breakdown.
 *
 * Q2 2026 report cited Spark growing from 4.3% → 10.4% of outstanding loans
 * over the quarter. We surface both a "current market share" ranked-bar and
 * a "share-over-time" area so viewers can see the actual trajectory.
 */

export const dynamic = "force-dynamic"
export const maxDuration = 30

// Order = display order (Spark first so it lines up with the accent-orange rule).
const PEERS = [
  { slug: "sparklend", name: "SparkLend", isSpark: true },
  { slug: "aave-v3", name: "Aave V3", isSpark: false },
  { slug: "morpho-blue", name: "Morpho Blue", isSpark: false },
  { slug: "fluid-lending", name: "Fluid Lending", isSpark: false },
  { slug: "compound-v3", name: "Compound V3", isSpark: false },
  { slug: "euler-v2", name: "Euler V2", isSpark: false },
] as const

let cache: any = null
let cacheTime = 0
const TTL = 30 * 60_000

interface Point {
  date: number
  value: number
}

function dayTs(ts: number): number {
  const d = new Date(ts * 1000)
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime() / 1000
}

async function fetchBorrowSeries(slug: string): Promise<Point[]> {
  const r = await fetch(`https://api.llama.fi/protocol/${slug}`, { cache: "no-store" })
  if (!r.ok) return []
  const j = await r.json()
  const series = j.chainTvls?.["Ethereum-borrowed"]?.tvl || []
  const map = new Map<number, number>()
  for (const p of series) map.set(dayTs(p.date), p.totalLiquidityUSD || 0)
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([date, value]) => ({ date, value }))
}

/** Forward-fill sparse series onto a common daily grid. */
function densify(series: Point[], from: number, to: number): Map<number, number> {
  const src = new Map<number, number>()
  for (const p of series) src.set(p.date, p.value)
  const out = new Map<number, number>()
  let last = 0
  for (let d = from; d <= to; d += 86400) {
    if (src.has(d)) last = src.get(d)!
    out.set(d, last)
  }
  return out
}

export async function GET() {
  if (cache && Date.now() - cacheTime < TTL) {
    return NextResponse.json(cache)
  }

  try {
    const results = await Promise.all(
      PEERS.map(async (p) => ({ ...p, series: await fetchBorrowSeries(p.slug) }))
    )

    // Anchor to the SPARKLEND launch (May 2023) since earlier dates would show
    // Spark at 0% and clutter the chart.
    const spark = results.find((r) => r.slug === "sparklend")!
    if (spark.series.length === 0) throw new Error("sparklend empty")
    const anchor = spark.series[0].date
    const today = dayTs(Math.floor(Date.now() / 1000))

    const densified = results.map((r) => ({
      ...r,
      d: densify(r.series, anchor, today),
    }))

    // Daily entries: { date, sparklend, aave-v3, ..., total, sparkShare }
    const daily: Array<Record<string, number>> = []
    for (let d = anchor; d <= today; d += 86400) {
      const entry: Record<string, number> = { date: d }
      let total = 0
      for (const p of densified) {
        const v = p.d.get(d) || 0
        entry[p.slug] = v
        total += v
      }
      entry.total = total
      entry.sparkShare = total > 0 ? (entry.sparklend / total) * 100 : 0
      daily.push(entry)
    }

    // Current snapshot per peer, sorted descending by current borrow.
    const latest = daily[daily.length - 1]
    const current = PEERS.map((p) => ({
      slug: p.slug,
      name: p.name,
      isSpark: p.isSpark,
      borrow: latest[p.slug] || 0,
      share: latest.total > 0 ? ((latest[p.slug] || 0) / latest.total) * 100 : 0,
    })).sort((a, b) => b.borrow - a.borrow)

    const result = {
      daily,
      current,
      currentTotal: latest.total,
      currentSparkShare: latest.sparkShare,
      meta: {
        source: "DefiLlama /protocol/{peer}/chainTvls[Ethereum-borrowed]",
        peers: PEERS.map((p) => p.slug),
        note:
          "Excludes off-Ethereum borrows (Aave has significant multi-chain, so this understates Aave's global lead). Q2 report used a similar Ethereum-only framing.",
      },
    }

    cache = result
    cacheTime = Date.now()

    const r = NextResponse.json(result)
    r.headers.set("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600")
    return r
  } catch (err: any) {
    console.error("Peers API error:", err.message?.slice(0, 100))
    if (cache) return NextResponse.json(cache)
    return NextResponse.json(
      { error: "Failed to fetch peer data", details: err.message },
      { status: 500 }
    )
  }
}
