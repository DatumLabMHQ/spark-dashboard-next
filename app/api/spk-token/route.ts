import { NextResponse } from "next/server"

/**
 * SPK token data — price history + current market cap.
 *
 * Uses DefiLlama Coins API which mirrors CoinGecko for `spark-2` (SPK's
 * gecko ID). Historical market cap is computed as historical_price × current
 * supply since DefiLlama doesn't return per-day mcap; SPK's circulating
 * supply moves slowly so this is a fair proxy.
 *
 * On-chain buyback tracker (SPK Transfer events into SPARK_PROXY treasury)
 * lives in a later phase — this route stays lightweight and Vercel-friendly.
 */

export const dynamic = "force-dynamic"
export const maxDuration = 30

const COIN_ID = "coingecko:spark-2"
const SPK_ADDRESS = "0xc20059e0317de91738d13af027dfc4a50781b066"

let cache: any = null
let cacheTime = 0
const TTL = 15 * 60_000

async function fetchChart() {
  const r = await fetch(`https://coins.llama.fi/chart/${COIN_ID}?span=365d&period=1d`, {
    cache: "no-store",
  })
  if (!r.ok) throw new Error(`chart ${r.status}`)
  const j = await r.json()
  return j.coins?.[COIN_ID]
}

async function fetchCurrentMcap() {
  const r = await fetch(`https://coins.llama.fi/mcaps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coins: [COIN_ID] }),
    cache: "no-store",
  })
  if (!r.ok) return null
  const j = await r.json()
  return j[COIN_ID]?.mcap || null
}

export async function GET() {
  if (cache && Date.now() - cacheTime < TTL) {
    return NextResponse.json(cache)
  }

  try {
    const [chart, currentMcap] = await Promise.all([fetchChart(), fetchCurrentMcap()])
    if (!chart?.prices?.length) throw new Error("no price data")

    const currentPrice = chart.prices.at(-1)?.price || 0
    const impliedSupply = currentPrice > 0 && currentMcap ? currentMcap / currentPrice : 0

    const daily = chart.prices.map((p: any) => ({
      date: p.timestamp,
      price: p.price,
      mcap: p.price * impliedSupply,
    }))

    const firstPrice = daily[0].price
    const drawdownPct = firstPrice > 0 ? ((currentPrice - firstPrice) / firstPrice) * 100 : 0

    const result = {
      daily,
      current: {
        price: currentPrice,
        mcap: currentMcap,
        supply: impliedSupply,
      },
      meta: {
        source: "DefiLlama Coins API (coingecko:spark-2)",
        contract: SPK_ADDRESS,
        firstDate: new Date(daily[0].date * 1000).toISOString().slice(0, 10),
        drawdownPct,
        note:
          "Historical mcap is a proxy: DefiLlama exposes historical price but not historical supply. We multiply historical price × current supply.",
      },
    }

    cache = result
    cacheTime = Date.now()

    const r = NextResponse.json(result)
    r.headers.set("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600")
    return r
  } catch (err: any) {
    console.error("SPK token API error:", err.message?.slice(0, 100))
    if (cache) return NextResponse.json(cache)
    return NextResponse.json(
      { error: "Failed to fetch SPK data", details: err.message },
      { status: 500 }
    )
  }
}
