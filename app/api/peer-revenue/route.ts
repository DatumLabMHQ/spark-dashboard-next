import { NextResponse } from "next/server"

/**
 * Peer revenue YoY comparison. For each lending protocol in our peer set,
 * fetches DefiLlama's daily revenue series and computes:
 *   • Trailing 90-day revenue
 *   • Prior 90-day revenue (day 91-180)
 *   • YoY-like % change between the two windows
 *
 * Morpho is excluded because DefiLlama doesn't route Morpho's fee model
 * through the standard fee series (0/0 both windows). SLL is tracked
 * separately because it's Spark's own product, not a peer.
 *
 * Q2 2026 report framing: Spark grew market share while Aave interest
 * income dropped 23% and Ethena fees dropped 21%. This API surfaces the
 * live version of that comparison.
 */

export const dynamic = "force-dynamic"
export const maxDuration = 30

const PEERS = [
  { slug: "sparklend", name: "SparkLend", isSpark: true },
  { slug: "aave-v3", name: "Aave V3", isSpark: false },
  { slug: "fluid-lending", name: "Fluid Lending", isSpark: false },
  { slug: "compound-v3", name: "Compound V3", isSpark: false },
  { slug: "euler-v2", name: "Euler V2", isSpark: false },
  { slug: "ethena", name: "Ethena", isSpark: false },
] as const

let cache: any = null
let cacheTime = 0
const TTL = 30 * 60_000

async function fetchRevenue(slug: string): Promise<Array<[number, number]>> {
  const r = await fetch(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyRevenue`, {
    cache: "no-store",
  })
  if (!r.ok) return []
  const j = await r.json()
  return j.totalDataChart || []
}

function computeWindow(
  chart: Array<[number, number]>,
  fromTs: number,
  toTs: number
): number {
  return chart.filter(([t]) => t >= fromTs && t < toTs).reduce((s, [_, v]) => s + v, 0)
}

export async function GET() {
  if (cache && Date.now() - cacheTime < TTL) {
    return NextResponse.json(cache)
  }

  try {
    const now = Math.floor(Date.now() / 1000)
    const cut90 = now - 90 * 86400
    const cut180 = now - 180 * 86400

    const [peers, sllChart] = await Promise.all([
      Promise.all(
        PEERS.map(async (p) => {
          const chart = await fetchRevenue(p.slug)
          const recent = computeWindow(chart, cut90, now + 86400)
          const prior = computeWindow(chart, cut180, cut90)
          const yoyPct = prior > 0 ? ((recent - prior) / prior) * 100 : null
          return { ...p, recent90d: recent, prior90d: prior, yoyPct }
        })
      ),
      fetchRevenue("spark-liquidity-layer"),
    ])

    const sllRecent = computeWindow(sllChart, cut90, now + 86400)
    const sllPrior = computeWindow(sllChart, cut180, cut90)
    const sllYoyPct = sllPrior > 0 ? ((sllRecent - sllPrior) / sllPrior) * 100 : null

    // Sort peers by YoY change descending — winners at top
    const sortedPeers = [...peers]
      .filter((p) => p.yoyPct !== null)
      .sort((a, b) => (b.yoyPct as number) - (a.yoyPct as number))

    const result = {
      peers: sortedPeers,
      sll: {
        slug: "spark-liquidity-layer",
        name: "Spark Liquidity Layer",
        recent90d: sllRecent,
        prior90d: sllPrior,
        yoyPct: sllYoyPct,
      },
      window: {
        recentStart: cut90,
        recentEnd: now,
        priorStart: cut180,
        priorEnd: cut90,
        days: 90,
      },
      meta: {
        source: "DefiLlama /summary/fees/{slug} dailyRevenue",
        note:
          "Morpho excluded — DefiLlama's fee series returns 0 for morpho / morpho-blue because Morpho's fee model is curator-based, not protocol-level. Q2 2026 report cited Aave interest income -23% and Ethena fees -21% over the quarter; the live 90-vs-prior-90 window is a slightly different framing but captures the same directional story.",
      },
    }

    cache = result
    cacheTime = Date.now()

    const r = NextResponse.json(result)
    r.headers.set("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600")
    return r
  } catch (err: any) {
    console.error("Peer revenue API error:", err.message?.slice(0, 100))
    if (cache) return NextResponse.json(cache)
    return NextResponse.json(
      { error: "Failed to fetch peer revenue", details: err.message },
      { status: 500 }
    )
  }
}
