/* eslint-disable @typescript-eslint/no-explicit-any -- vendored route handler.
 * Copied verbatim from sparklend-dashboard so the Spark corrections travel with it. These parse
 * untyped third-party JSON and on-chain logs; hand-retyping them here would risk a regression in
 * numbers already verified in production.
 * NEW code in this app must not use `any` - the kit's rule stands everywhere else.
 */
import { NextResponse } from "next/server"

/**
 * SPK top token holders via Ethplorer's freekey. Ethplorer indexes ERC-20
 * balances across every address that has ever held the token; the freekey
 * tier allows getTopTokenHolders queries with reasonable rate limits.
 *
 * We enrich each address with a human label where we recognise it (SPARK_PROXY
 * treasury, known CEX wallets, common bridge/vesting patterns). Where we
 * don't recognise an address, we mark it Unknown — that's the interesting
 * part for the "who's actually accumulating SPK?" narrative.
 */

export const dynamic = "force-dynamic"
export const maxDuration = 30

const SPK_ADDRESS = "0xc20059e0317de91738d13af027dfc4a50781b066"

// Address → { label, category }. Categories:
//   "Protocol treasury" — Spark's own treasury (SPARK_PROXY)
//   "CEX" — centralized exchange cold wallet
//   "Vesting / lock" — team, investor, or foundation vesting contracts
//   "DEX / LP" — DEX pool addresses providing SPK liquidity
//   "Unknown"
const KNOWN_ADDRESSES: Record<string, { label: string; category: string }> = {
  "0x3300f198988e4c9c63f75df86de36421f06af8c4": {
    label: "SPARK_PROXY (Spark treasury)",
    category: "Protocol treasury",
  },
  "0xf977814e90da44bfa03b6295a0616a897441acec": {
    label: "Binance cold wallet",
    category: "CEX",
  },
  "0xbe8e3e3618f7474f8cb1d074a26affef007e98fb": {
    label: "SPK vesting / airdrop escrow (largest single holder)",
    category: "Vesting / lock",
  },
}

const CATEGORY_COLORS: Record<string, string> = {
  "Protocol treasury": "#FF6B35",
  CEX: "#3b82f6",
  "Vesting / lock": "#a855f7",
  "DEX / LP": "#22c55e",
  Unknown: "#6B7280",
}

let cache: any = null
let cacheTime = 0
const TTL = 60 * 60_000 // 1 hour — ethplorer freekey should not be hit hard

export async function GET() {
  if (cache && Date.now() - cacheTime < TTL) {
    return NextResponse.json(cache)
  }

  try {
    const url = `https://api.ethplorer.io/getTopTokenHolders/${SPK_ADDRESS}?apiKey=freekey&limit=20`
    const r = await fetch(url, { cache: "no-store" })
    if (!r.ok) throw new Error(`ethplorer ${r.status}`)
    const j = await r.json()
    if (!j.holders?.length) throw new Error("no holders returned")

    const totalSupply = j.holders.reduce((s: number, h: any) => s + Number(h.balance), 0)

    const holders = j.holders.map((h: any, i: number) => {
      const address = h.address.toLowerCase()
      const known = KNOWN_ADDRESSES[address]
      const category = known?.category || "Unknown"
      // Ethplorer balance is raw with 18 decimals for SPK
      const tokenBalance = Number(h.balance) / 1e18
      return {
        rank: i + 1,
        address,
        shortAddress: `${address.slice(0, 8)}…${address.slice(-6)}`,
        label: known?.label || null,
        category,
        color: CATEGORY_COLORS[category] || CATEGORY_COLORS.Unknown,
        tokenBalance,
        share: h.share, // ethplorer returns share as % of tracked balance
      }
    })

    // Roll up by category
    const byCategory: Record<string, { category: string; share: number; count: number; color: string }> = {}
    for (const h of holders) {
      if (!byCategory[h.category]) {
        byCategory[h.category] = {
          category: h.category,
          share: 0,
          count: 0,
          color: h.color,
        }
      }
      byCategory[h.category].share += h.share
      byCategory[h.category].count++
    }
    const categories = Object.values(byCategory).sort((a, b) => b.share - a.share)

    // Herfindahl on top 20
    const hhi = holders.reduce((s: number, h: any) => s + h.share * h.share, 0)

    const result = {
      holders,
      categories,
      hhi,
      totalSupply,
      meta: {
        source: "Ethplorer /getTopTokenHolders (freekey)",
        note:
          "Top 20 by balance. Share is % of the tracked balance across those top 20, not % of circulating supply. Categories are hand-labelled from known governance / exchange / vesting addresses.",
        knownCount: holders.filter((h: any) => h.category !== "Unknown").length,
      },
    }

    cache = result
    cacheTime = Date.now()

    const res = NextResponse.json(result)
    res.headers.set("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600")
    return res
  } catch (err: any) {
    console.error("SPK holders API error:", err.message?.slice(0, 100))
    if (cache) return NextResponse.json(cache)
    return NextResponse.json(
      { error: "Failed to fetch SPK holders", details: err.message },
      { status: 500 }
    )
  }
}
