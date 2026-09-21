import { NextResponse } from "next/server"

/**
 * Spark ecosystem TVL — merges the 3 product lines that Spark markets itself
 * around: Savings (sUSDS deposits routed via Spark), SparkLend (lending pool),
 * and Spark Liquidity Layer (ALM Proxy deployments). Time series aligned on
 * daily UTC timestamps; missing days on any leg carry the prior value forward
 * so the stack is always continuous.
 *
 * Q2 2026 report cited $12.6B ecosystem = $6.4B Savings + $3.6B SparkLend +
 * $2.6B SLL. Our numbers use DefiLlama's Spark-attributed segmentation, which
 * is smaller for Savings (deposits routed via Spark's UI only, not the total
 * sUSDS float). Reconciliation footnote lives on the chart itself.
 */

export const dynamic = "force-dynamic"
export const maxDuration = 30

const SLUGS = {
  savings: "spark-savings",
  sparklend: "sparklend",
  sll: "spark-liquidity-layer",
} as const

type Series = Array<{ date: number; value: number }>

let cache: any = null
let cacheTime = 0
const TTL = 30 * 60_000

async function fetchProtocolAllChains(
  slug: string
): Promise<{ tvl: Series; borrow: Series; perChain: Record<string, Series> }> {
  const res = await fetch(`https://api.llama.fi/protocol/${slug}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`${slug} ${res.status}`)
  const data = await res.json()
  const tvlMap = new Map<number, number>()
  const borrowMap = new Map<number, number>()
  const perChain: Record<string, Map<number, number>> = {}
  for (const [chainKey, ct] of Object.entries<any>(data.chainTvls || {})) {
    if (chainKey === "staking" || chainKey === "pool2" || chainKey === "borrowed") continue
    const isBorrow = chainKey.endsWith("-borrowed")
    const target = isBorrow ? borrowMap : tvlMap
    // Per-chain tracking (skip the "-borrowed" duplicates since we want the
    // supply-side chain breakdown, not the borrowed side).
    if (!isBorrow) {
      if (!perChain[chainKey]) perChain[chainKey] = new Map()
    }
    for (const p of ct.tvl || []) {
      target.set(p.date, (target.get(p.date) || 0) + p.totalLiquidityUSD)
      if (!isBorrow) {
        perChain[chainKey].set(p.date, p.totalLiquidityUSD)
      }
    }
  }
  const toSeries = (m: Map<number, number>): Series =>
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([date, value]) => ({ date, value }))
  const perChainOut: Record<string, Series> = {}
  for (const [k, v] of Object.entries(perChain)) perChainOut[k] = toSeries(v)
  return {
    tvl: toSeries(tvlMap),
    borrow: toSeries(borrowMap),
    perChain: perChainOut,
  }
}

function dayTs(ts: number): number {
  const d = new Date(ts * 1000)
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime() / 1000
}

/** Forward-fill a sparse series so it has an entry for every day in [from, to]. */
function densify(series: Series, from: number, to: number): Map<number, number> {
  const out = new Map<number, number>()
  const map = new Map<number, number>()
  for (const p of series) map.set(dayTs(p.date), p.value)
  let last = 0
  for (let d = from; d <= to; d += 86400) {
    if (map.has(d)) last = map.get(d)!
    out.set(d, last)
  }
  return out
}

export async function GET() {
  if (cache && Date.now() - cacheTime < TTL) {
    return NextResponse.json(cache)
  }

  try {
    const [savings, sparklend, sll] = await Promise.all([
      fetchProtocolAllChains(SLUGS.savings),
      fetchProtocolAllChains(SLUGS.sparklend),
      fetchProtocolAllChains(SLUGS.sll),
    ])

    // SparkLend "TVL" in DefiLlama is available liquidity; total supply =
    // TVL + Borrowed. That's what we want the stack to show.
    const sparkLendSupply: Series = (() => {
      const bMap = new Map<number, number>()
      for (const p of sparklend.borrow) bMap.set(p.date, p.value)
      return sparklend.tvl.map((p) => ({
        date: p.date,
        value: p.value + (bMap.get(p.date) || 0),
      }))
    })()

    // Align on a common daily grid. Anchor to the earliest date any leg has
    // data (Savings is youngest, launched Sept 2025), and end at today.
    const allDates = [
      ...savings.tvl.map((p) => p.date),
      ...sparkLendSupply.map((p) => p.date),
      ...sll.tvl.map((p) => p.date),
    ]
    if (allDates.length === 0) throw new Error("no data")

    const earliest = dayTs(Math.min(...allDates))
    const today = dayTs(Math.floor(Date.now() / 1000))

    const savingsD = densify(savings.tvl, earliest, today)
    const sparkD = densify(sparkLendSupply, earliest, today)
    const sllD = densify(sll.tvl, earliest, today)

    const daily: Array<{
      date: number
      savings: number
      sparklend: number
      sll: number
      total: number
    }> = []
    for (let d = earliest; d <= today; d += 86400) {
      const s = savingsD.get(d) || 0
      const l = sparkD.get(d) || 0
      const x = sllD.get(d) || 0
      daily.push({ date: d, savings: s, sparklend: l, sll: x, total: s + l + x })
    }

    const latest = daily[daily.length - 1]

    // Per-chain daily series for Savings + SLL. Aligned onto the same daily
    // grid + forward-filled so a stacked-by-chain area is continuous.
    function densifyPerChain(perChain: Record<string, Series>): {
      chains: string[]
      daily: Array<Record<string, number>>
    } {
      const chainNames = Object.keys(perChain)
      const denseMap: Record<string, Map<number, number>> = {}
      for (const c of chainNames) denseMap[c] = densify(perChain[c], earliest, today)
      const out: Array<Record<string, number>> = []
      for (let d = earliest; d <= today; d += 86400) {
        const entry: Record<string, number> = { date: d }
        for (const c of chainNames) entry[c] = denseMap[c].get(d) || 0
        out.push(entry)
      }
      // Sort chain names by latest value, descending
      const latestByChain: Record<string, number> = {}
      for (const c of chainNames) latestByChain[c] = out.at(-1)?.[c] || 0
      const sorted = chainNames.sort((a, b) => latestByChain[b] - latestByChain[a])
      return { chains: sorted, daily: out }
    }

    const savingsByChain = densifyPerChain(savings.perChain)
    const sllByChain = densifyPerChain(sll.perChain)

    const result = {
      daily,
      current: {
        savings: latest.savings,
        sparklend: latest.sparklend,
        sll: latest.sll,
        total: latest.total,
      },
      savingsByChain,
      sllByChain,
      meta: {
        source: "DefiLlama /protocol/{spark-savings, sparklend, spark-liquidity-layer}",
        sparkLendNote:
          "SparkLend line = DefiLlama Ethereum TVL + Ethereum-borrowed (i.e. total supplied). Available liquidity alone is smaller.",
        savingsNote:
          "Spark Savings on DefiLlama attributes deposits routed via Spark's UI only, not the total sUSDS float. Sky's Q2 report cited $6.4B total Savings — this line sits below that.",
      },
    }

    cache = result
    cacheTime = Date.now()

    const r = NextResponse.json(result)
    r.headers.set("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600")
    return r
  } catch (err: any) {
    console.error("Ecosystem API error:", err.message?.slice(0, 100))
    if (cache) return NextResponse.json(cache)
    return NextResponse.json(
      { error: "Failed to fetch ecosystem data", details: err.message },
      { status: 500 }
    )
  }
}
