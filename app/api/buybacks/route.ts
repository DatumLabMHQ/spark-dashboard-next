import { NextResponse } from "next/server"
import {
  client,
  SPARK_PROXY,
  SPARK_OPS_MULTISIG,
  TREASURY_ASSETS,
} from "@/lib/contracts"
import { currentThreshold, BUYBACK_THRESHOLDS } from "@/lib/spark-config"
import { type Address, parseAbiItem, formatUnits } from "viem"

export const dynamic = "force-dynamic"
export const revalidate = 900 // 15 min — treasury moves in ~monthly cadence
export const maxDuration = 60

interface TreasuryLine {
  symbol: string
  amount: number
  priceUSD: number
  valueUSD: number
  /** Own-token holdings (SPK) are informational only; excluded from the
      spendable-treasury total to match Phoenix Labs' "Total Treasury"
      convention in the monthly proxy-management posts. */
  isSpendable: boolean
}

interface BuybackFill {
  timestamp: number
  txHash: string
  usdsSpent: number
  spkBought: number
  effectivePriceUSD: number
  kind: "spk_in" | "usds_out"
}

interface BuybackResponse {
  treasury: {
    totalUSD: number       // spendable only (excludes SPK own-token)
    spkHeldUSD: number     // SPK sitting in the proxy (from prior buybacks)
    spkHeldAmount: number
    lines: TreasuryLine[]
    asOf: number
  }
  historicalUSD: Array<{ date: number; totalUSD: number }>
  threshold: {
    targetUSD: number
    cushionUSD: number
    cushionMonths: number | null
    standardBuybackRate: number
    monthlyBudgetUSD: number
    effectiveFrom: string
    note?: string
    sourceUrl: string
  }
  buybacks: {
    fills: BuybackFill[]
    cumulativeUsdsSpent: number
    cumulativeSpkBought: number
    avgPriceUSD: number | null
  }
  meta: {
    treasuryAddress: Address
    opsMultisig: Address
    sourcesUsed: string[]
    generatedAt: number
  }
}

const erc20BalanceOfAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const

// SPK Transfer events into the SubDAO proxy = buybacks landing home. Same event
// shape as USDS out from the ops multisig — the fill IS the transfer.
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
)

// ── Price helpers ────────────────────────────────────────────────────────────

/**
 * DefiLlama Coins /prices/current — batched, one call for all tokens we care
 * about. Symbols returned as {"ethereum:0x...": {price, symbol, ...}}.
 */
async function fetchPrices(addresses: Address[]): Promise<Record<string, number>> {
  const keys = addresses.map((a) => `ethereum:${a.toLowerCase()}`).join(",")
  const res = await fetch(`https://coins.llama.fi/prices/current/${keys}`, {
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`Coins API ${res.status}`)
  const data = await res.json()
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries<any>(data.coins || {})) {
    const addr = k.split(":")[1]?.toLowerCase()
    if (addr) out[addr] = v.price
  }
  return out
}

// ── Treasury ─────────────────────────────────────────────────────────────────

async function fetchTreasuryLive(): Promise<{
  totalUSD: number
  spkHeldUSD: number
  spkHeldAmount: number
  lines: TreasuryLine[]
}> {
  const balances = await client.multicall({
    contracts: TREASURY_ASSETS.map((asset) => ({
      address: asset.address,
      abi: erc20BalanceOfAbi,
      functionName: "balanceOf" as const,
      args: [SPARK_PROXY] as const,
    })),
    allowFailure: true,
  })

  const prices = await fetchPrices(TREASURY_ASSETS.map((a) => a.address))

  const lines: TreasuryLine[] = []
  for (let i = 0; i < TREASURY_ASSETS.length; i++) {
    const asset = TREASURY_ASSETS[i]
    const bal = balances[i]
    if (bal.status !== "success") continue
    const amount = Number(formatUnits(bal.result as bigint, asset.decimals))
    const priceUSD = prices[asset.address.toLowerCase()] ?? 0
    lines.push({
      symbol: asset.symbol,
      amount,
      priceUSD,
      valueUSD: amount * priceUSD,
      isSpendable: asset.symbol !== "SPK",
    })
  }

  const spkLine = lines.find((l) => l.symbol === "SPK")
  const totalUSD = lines
    .filter((l) => l.isSpendable)
    .reduce((s, l) => s + l.valueUSD, 0)

  return {
    totalUSD,
    spkHeldUSD: spkLine?.valueUSD ?? 0,
    spkHeldAmount: spkLine?.amount ?? 0,
    lines,
  }
}

async function fetchTreasuryHistorical(): Promise<
  Array<{ date: number; totalUSD: number }>
> {
  // DefiLlama treasury endpoint carries a daily "tokensInUsd" series across all
  // tracked treasury assets. It's the same series that shows in Sam's chart —
  // use it for the historical line so we don't have to run a per-day archival
  // scan on our own RPC.
  try {
    const res = await fetch("https://api.llama.fi/treasury/spark", {
      next: { revalidate: 900 },
    })
    if (!res.ok) throw new Error(`treasury ${res.status}`)
    const data = await res.json()
    const series = data?.chainTvls?.Ethereum?.tokensInUsd
    if (!Array.isArray(series)) return []
    return series
      .map((p: any) => ({
        date: p.date as number,
        totalUSD: Object.values<number>(p.tokens || {}).reduce(
          (s, v) => s + (typeof v === "number" ? v : 0),
          0
        ),
      }))
      .filter((p) => p.totalUSD > 0)
      .slice(-365)
  } catch (e: any) {
    console.error("treasury historical:", e.message)
    return []
  }
}

// ── Buyback fills ────────────────────────────────────────────────────────────

/**
 * SPK buyback series.
 *
 * CORRECTED 2026-08-25. The previous implementation counted SPK moving from
 * the Ops Multisig to the SubDAO Proxy and USDS moving the other way, and
 * reported those as purchases and spend. Both were the wrong leg.
 *
 * The real flow, verified on-chain:
 *
 *     CoW Protocol settlement  ->  buyback contract  ->  Ops Multisig
 *     0x9008D19f58Aa...            0x797B010E0BAB...     0x2E1b01adAB...
 *
 * The purchase happens when the buyback contract receives SPK from CoW's
 * GPv2Settlement. A chunked eth_getLogs scan of SPK Transfer(*, buyback)
 * over the trailing ~430 days returns 2,390 fills totalling 120.78M SPK,
 * all of them from the settlement contract and none from anywhere else.
 * That reconciles with Spark's own "over 100M SPK bought back" statement.
 * The old figure of 94.26M was the onward transfer to the multisig, and the
 * old $3.80M "spend" was USDS sent to the multisig for future rounds rather
 * than money actually spent on SPK.
 *
 * That scan takes minutes across 326 chunks, which does not fit a serverless
 * request. DefiLlama publishes the same purchase leg as its `holdersRevenue`
 * series for the `spark` adapter, which reads SPK received at exactly this
 * buyback address (see dimension-adapters/fees/spark: addTokensReceived with
 * target = buybackAddress). So the USD series comes from there, and the
 * verified SPK total is carried as a constant with the scan committed
 * alongside for reproducibility (data/probe-sll-positions.mjs pattern).
 */

/** Verified by chunked eth_getLogs on 2026-08-25: SPK Transfer(*, 0x797B...) */
const VERIFIED_SPK_BOUGHT_BACK = 120_780_000
const VERIFIED_AS_OF = "2026-08-25"
const BUYBACK_CONTRACT = "0x797B010E0BABb493b8DEDD6F6ce5cc72778C2BF3"

async function fetchBuybackFills(): Promise<BuybackFill[]> {
  // DefiLlama's holdersRevenue for `spark` is the USD value of SPK received
  // at the buyback contract, i.e. the purchase leg, daily.
  try {
    const res = await fetch(
      "https://api.llama.fi/summary/fees/spark?dataType=dailyHoldersRevenue",
      { next: { revalidate: 900 } }
    )
    if (!res.ok) throw new Error(`llama ${res.status}`)
    const data = await res.json()
    const chart: Array<[number, number]> = data?.totalDataChart ?? []
    return chart
      .filter(([, usd]) => usd > 0)
      .map(([ts, usd]) => ({
        timestamp: ts,
        txHash: "",
        spkBought: 0,
        usdsSpent: usd,
        effectivePriceUSD: 0,
        kind: "usds_out" as const,
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
  } catch (e: any) {
    console.error("buyback series fetch:", e.message)
    return []
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET() {
  const started = Date.now()
  const sources: string[] = []
  const [liveTreasury, historical, fills] = await Promise.all([
    fetchTreasuryLive().then((r) => {
      sources.push("on-chain balanceOf")
      return r
    }),
    fetchTreasuryHistorical().then((r) => {
      if (r.length) sources.push("api.llama.fi/treasury/spark")
      return r
    }),
    fetchBuybackFills().then((r) => {
      sources.push(
        `SPK purchases: eth_getLogs Transfer(*, ${BUYBACK_CONTRACT}) verified ${VERIFIED_AS_OF}; USD leg: DefiLlama holdersRevenue`
      )
      return r
    }),
  ])

  const threshold = currentThreshold()
  const cushionUSD = liveTreasury.totalUSD - threshold.targetUSD
  const cushionMonths =
    threshold.monthlyBudgetUSD > 0 ? cushionUSD / threshold.monthlyBudgetUSD : null

  // Sum each leg independently — SPK-in and USDS-out are two sides of the
  // same buyback flow but they don't land 1:1 per tx (CoW TWAP orders settle
  // asynchronously across days), so pairing per-row would misreport pace.
  // SPK quantity comes from the verified on-chain scan; USD comes from the
  // daily purchase-leg series. Both describe the same flow (SPK received at
  // the buyback contract from CoW settlement), so dividing them gives a
  // genuine program-wide VWAP.
  const cumulativeSpkBought = VERIFIED_SPK_BOUGHT_BACK
  const cumulativeUsdsSpent = fills.reduce((s, f) => s + f.usdsSpent, 0)
  const avgPriceUSD =
    cumulativeSpkBought > 0 ? cumulativeUsdsSpent / cumulativeSpkBought : null

  const response: BuybackResponse = {
    treasury: {
      totalUSD: liveTreasury.totalUSD,
      spkHeldUSD: liveTreasury.spkHeldUSD,
      spkHeldAmount: liveTreasury.spkHeldAmount,
      lines: liveTreasury.lines,
      asOf: Math.floor(Date.now() / 1000),
    },
    historicalUSD: historical,
    threshold: {
      targetUSD: threshold.targetUSD,
      cushionUSD,
      cushionMonths,
      standardBuybackRate: threshold.standardBuybackRate,
      monthlyBudgetUSD: threshold.monthlyBudgetUSD,
      effectiveFrom: threshold.effectiveFrom,
      note: threshold.note,
      sourceUrl: threshold.sourceUrl,
    },
    buybacks: {
      fills,
      cumulativeUsdsSpent,
      cumulativeSpkBought,
      avgPriceUSD,
    },
    meta: {
      treasuryAddress: SPARK_PROXY,
      opsMultisig: SPARK_OPS_MULTISIG,
      sourcesUsed: sources,
      generatedAt: started,
    },
  }

  return NextResponse.json(response)
}
