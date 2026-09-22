/* eslint-disable @typescript-eslint/no-explicit-any -- vendored route handler.
 * Copied verbatim from sparklend-dashboard so the Spark corrections travel with it. These parse
 * untyped third-party JSON and on-chain logs; hand-retyping them here would risk a regression in
 * numbers already verified in production.
 * NEW code in this app must not use `any` - the kit's rule stands everywhere else.
 */
import { NextResponse } from "next/server"
import {
  client,
  POOL,
  POOL_ADDRESSES_PROVIDER,
  poolAddressesProviderAbi,
  poolDataProviderAbi,
  oracleAbi,
} from "@/lib/contracts"
import { type Address, parseAbiItem } from "viem"
import { readFileSync, writeFileSync, existsSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
// Scanned history, committed. The cold scan from the 2023 deployment block is ~184 sequential
// getLogs calls and takes five minutes, which is longer than a serverless function gets. The
// events below block `lastScannedBlock` are immutable, so they ship with the app and only the
// tail is scanned at runtime.
import rawSeed from "@/data/liquidation-events-seed.json"

export const dynamic = "force-dynamic"

const DEPLOYMENT_BLOCK = 16_848_000n
const CHUNK_SIZE = 50_000n
// Vercel's filesystem is read-only apart from /tmp, so the working cache lives there in prod.
const CACHE_DIR = process.env.VERCEL ? tmpdir() : process.cwd()
const RAW_CACHE_FILE = join(CACHE_DIR, ".liquidation-raw-cache.json")
const RESULT_CACHE_FILE = join(CACHE_DIR, ".liquidation-result-cache.json")

let memResult: any = null
let memResultTime = 0
let scanRunning = false

const liquidationEvent = parseAbiItem(
  "event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)"
)

// ── Cache helpers ──

function readJSON(path: string): any {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"))
  } catch (e: any) {
    console.error(`Read ${path}:`, e.message)
  }
  return null
}

function writeJSON(path: string, data: any) {
  try {
    writeFileSync(path, JSON.stringify(data), "utf-8")
  } catch (e: any) {
    console.error(`Write ${path}:`, e.message)
  }
}

// ── Token info ──

async function getTokenMap() {
  const dpAddr = (await client.readContract({
    address: POOL_ADDRESSES_PROVIDER,
    abi: poolAddressesProviderAbi,
    functionName: "getPoolDataProvider",
  })) as Address

  const tokens = (await client.readContract({
    address: dpAddr,
    abi: poolDataProviderAbi,
    functionName: "getAllReservesTokens",
  })) as Array<{ symbol: string; tokenAddress: Address }>

  const configCalls = tokens.map((t) => ({
    address: dpAddr,
    abi: poolDataProviderAbi,
    functionName: "getReserveConfigurationData" as const,
    args: [t.tokenAddress],
  }))
  const configs = await client.multicall({ contracts: configCalls })

  const symbolMap: Record<string, string> = {}
  const decimalsMap: Record<string, number> = {}
  const liqBonusMap: Record<string, number> = {}
  const addresses: Address[] = []

  tokens.forEach((t, i) => {
    const addr = t.tokenAddress.toLowerCase()
    symbolMap[addr] = t.symbol
    decimalsMap[addr] = Number((configs[i].result as any)?.[0] || 18)
    // liquidationBonus is index [3], in basis points with 10000 = 100% (no bonus)
    // e.g., 10500 = 5% bonus, 11000 = 10% bonus
    const rawBonus = Number((configs[i].result as any)?.[3] || 10000)
    liqBonusMap[addr] = (rawBonus - 10000) / 10000 // e.g., 0.05 for 5%
    addresses.push(t.tokenAddress)
  })

  return { symbolMap, decimalsMap, liqBonusMap, addresses }
}

async function getPrices(addresses: Address[]): Promise<Record<string, number>> {
  const oracleAddr = (await client.readContract({
    address: POOL_ADDRESSES_PROVIDER,
    abi: poolAddressesProviderAbi,
    functionName: "getPriceOracle",
  })) as Address

  const prices = (await client.readContract({
    address: oracleAddr,
    abi: oracleAbi,
    functionName: "getAssetsPrices",
    args: [addresses],
  })) as bigint[]

  const priceMap: Record<string, number> = {}
  addresses.forEach((addr, i) => {
    priceMap[addr.toLowerCase()] = Number(prices[i]) / 1e8
  })
  return priceMap
}

// ── Historical prices from DefiLlama ──

const HIST_PRICE_CACHE_FILE = join(CACHE_DIR, ".liquidation-hist-prices.json")

function dayTimestamp(ts: number): number {
  const d = new Date(ts * 1000)
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime() / 1000
}

// Fetch prices for all tokens at a specific timestamp via DefiLlama
async function fetchPricesAtTimestamp(
  tokens: string[],
  timestamp: number
): Promise<Record<string, number>> {
  const coins = tokens.map((t) => `ethereum:${t}`).join(",")
  const result: Record<string, number> = {}
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(
      `https://coins.llama.fi/prices/historical/${timestamp}/${coins}?searchWidth=12h`,
      { cache: "no-store", signal: controller.signal }
    )
    clearTimeout(timeout)
    if (!res.ok) return result
    const data = await res.json()
    for (const token of tokens) {
      const coin = `ethereum:${token}`
      if (data.coins?.[coin]?.price) {
        result[token] = data.coins[coin].price
      }
    }
  } catch {
    // Skip on timeout/error
  }
  return result
}

async function getHistoricalPrices(
  rawEvents: any[],
  currentBlockNum: number,
  nowTimestamp: number
): Promise<Record<string, Map<number, number>>> {
  // Check cache — use longer TTL since historical prices don't change
  const cached = readJSON(HIST_PRICE_CACHE_FILE)
  if (cached?.data && Date.now() - cached.timestamp < 86_400_000) {
    const result: Record<string, Map<number, number>> = {}
    for (const [addr, entries] of Object.entries(cached.data)) {
      result[addr] = new Map(entries as [number, number][])
    }
    return result
  }

  // Collect unique token addresses
  const tokenSet = new Set<string>()
  for (const e of rawEvents) {
    tokenSet.add(e.collateralAsset)
    tokenSet.add(e.debtAsset)
  }
  const tokens = Array.from(tokenSet)

  // Group events by week (using estimated timestamps) to reduce API calls
  const weekSet = new Set<number>()
  for (const e of rawEvents) {
    const blockDiff = currentBlockNum - e.blockNumber
    const estTs = nowTimestamp - blockDiff * 12
    // Round to nearest week start (Monday)
    const day = dayTimestamp(estTs)
    const d = new Date(day * 1000)
    const dayOfWeek = d.getUTCDay()
    const monday = day - ((dayOfWeek === 0 ? 6 : dayOfWeek - 1) * 86400)
    weekSet.add(monday)
  }
  const days = Array.from(weekSet).sort()
  console.log(`Fetching historical prices for ${tokens.length} tokens across ${days.length} unique weeks`)

  // Initialize result
  const result: Record<string, Map<number, number>> = {}
  for (const t of tokens) result[t] = new Map()

  // Fetch prices for each day (batch 10 concurrent requests)
  for (let i = 0; i < days.length; i += 10) {
    const batch = days.slice(i, i + 10)
    const responses = await Promise.all(
      batch.map((day) => fetchPricesAtTimestamp(tokens, day))
    )
    for (let j = 0; j < batch.length; j++) {
      for (const [addr, price] of Object.entries(responses[j])) {
        result[addr].set(batch[j], price)
      }
    }
  }

  const totalPricePoints = Object.values(result).reduce((s, m) => s + m.size, 0)
  console.log(`Historical prices fetched: ${totalPricePoints} data points`)

  // Cache as serializable arrays
  try {
    const serializable: Record<string, [number, number][]> = {}
    for (const [addr, map] of Object.entries(result)) {
      serializable[addr] = Array.from(map.entries())
    }
    writeJSON(HIST_PRICE_CACHE_FILE, { data: serializable, timestamp: Date.now() })
  } catch {}

  return result
}

function lookupHistPrice(
  histPrices: Record<string, Map<number, number>>,
  tokenAddr: string,
  timestamp: number,
  fallbackPrice: number
): number {
  const map = histPrices[tokenAddr]
  if (!map || map.size === 0) return fallbackPrice

  const day = dayTimestamp(timestamp)
  // Find nearest entry within ±14 days (weekly granularity)
  for (let offset = 0; offset <= 86400 * 14; offset += 86400) {
    if (map.has(day - offset)) return map.get(day - offset)!
    if (offset > 0 && map.has(day + offset)) return map.get(day + offset)!
  }

  return fallbackPrice
}

// ── Scanning ──

async function scanLiquidations(from: bigint, to: bigint): Promise<any[]> {
  const rawEvents: any[] = []
  let current = from

  while (current <= to) {
    const end = current + CHUNK_SIZE > to ? to : current + CHUNK_SIZE
    try {
      const logs = await client.getLogs({
        address: POOL,
        event: liquidationEvent,
        fromBlock: current,
        toBlock: end,
      })
      rawEvents.push(...logs)
    } catch {
      // Retry with smaller chunks
      let sub = current
      while (sub <= end) {
        const subEnd = sub + 10_000n > end ? end : sub + 10_000n
        try {
          await new Promise((r) => setTimeout(r, 200))
          const logs = await client.getLogs({
            address: POOL,
            event: liquidationEvent,
            fromBlock: sub,
            toBlock: subEnd,
          })
          rawEvents.push(...logs)
        } catch {
          // skip
        }
        sub = subEnd + 1n
      }
    }
    current = end + 1n
  }

  return rawEvents.map((log) => ({
    collateralAsset: (log.args.collateralAsset as string).toLowerCase(),
    debtAsset: (log.args.debtAsset as string).toLowerCase(),
    user: (log.args.user as string).toLowerCase(),
    debtToCover: log.args.debtToCover?.toString() || "0",
    liquidatedCollateralAmount: log.args.liquidatedCollateralAmount?.toString() || "0",
    liquidator: (log.args.liquidator as string).toLowerCase(),
    txHash: log.transactionHash,
    blockNumber: Number(log.blockNumber),
  }))
}

async function getOrScanRawEvents(): Promise<any[]> {
  // Prefer the working cache; fall back to the committed seed, which is the same shape.
  const seed = rawSeed as { events: any[]; lastScannedBlock: string }
  const onDisk = readJSON(RAW_CACHE_FILE)
  const cached =
    onDisk?.events?.length > 0 &&
    onDisk.lastScannedBlock &&
    BigInt(onDisk.lastScannedBlock) >= BigInt(seed.lastScannedBlock)
      ? onDisk
      : seed

  if (cached?.events?.length > 0 && cached.lastScannedBlock) {
    const currentBlock = await client.getBlockNumber()
    const lastScanned = BigInt(cached.lastScannedBlock)

    // Scan new blocks since last cache
    if (currentBlock - lastScanned > 100n) {
      console.log(`Liquidation incremental scan: blocks ${lastScanned + 1n} to ${currentBlock}`)
      const newEvents = await scanLiquidations(lastScanned + 1n, currentBlock)
      const allEvents = [...cached.events, ...newEvents]
      writeJSON(RAW_CACHE_FILE, {
        events: allEvents,
        lastScannedBlock: currentBlock.toString(),
        timestamp: Date.now(),
      })
      console.log(`Liquidation scan: ${newEvents.length} new events, ${allEvents.length} total`)
      return allEvents
    }
    return cached.events
  }

  // Full scan from deployment
  const currentBlock = await client.getBlockNumber()
  console.log(`Liquidation full scan: blocks ${DEPLOYMENT_BLOCK} to ${currentBlock}`)
  const events = await scanLiquidations(DEPLOYMENT_BLOCK, currentBlock)
  writeJSON(RAW_CACHE_FILE, {
    events,
    lastScannedBlock: currentBlock.toString(),
    timestamp: Date.now(),
  })
  console.log(`Liquidation full scan complete: ${events.length} events`)
  return events
}

// ── Process events ──

function processEvents(
  rawEvents: any[],
  symbolMap: Record<string, string>,
  decimalsMap: Record<string, number>,
  liqBonusMap: Record<string, number>,
  priceMap: Record<string, number>,
  histPrices: Record<string, Map<number, number>>,
  currentBlockNum: number,
  nowTimestamp: number
) {
  return rawEvents
    .map((raw: any) => {
      const collAddr = raw.collateralAsset
      const debtAddr = raw.debtAsset
      const collDecimals = decimalsMap[collAddr] || 18
      const debtDecimals = decimalsMap[debtAddr] || 18

      const collateralAmount = Number(raw.liquidatedCollateralAmount) / Math.pow(10, collDecimals)
      const debtAmount = Number(raw.debtToCover) / Math.pow(10, debtDecimals)

      // Estimate timestamp from block number (~12s per block on mainnet)
      const blockDiff = currentBlockNum - raw.blockNumber
      const estimatedTimestamp = nowTimestamp - blockDiff * 12

      // Use historical prices at time of liquidation, fall back to current
      const collPrice = lookupHistPrice(histPrices, collAddr, estimatedTimestamp, priceMap[collAddr] || 0)
      const debtPrice = lookupHistPrice(histPrices, debtAddr, estimatedTimestamp, priceMap[debtAddr] || 0)

      const collateralSeizedUSD = collateralAmount * collPrice
      const debtRepaidUSD = debtAmount * debtPrice

      // Profit = debtRepaid * liquidationBonus for the collateral asset
      // This is more accurate than collateral - debt with historical prices
      const bonus = liqBonusMap[collAddr] || 0.05
      const profit = debtRepaidUSD * bonus

      const dateObj = new Date(estimatedTimestamp * 1000)

      return {
        date: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        timestamp: estimatedTimestamp,
        collateralAsset: symbolMap[collAddr] || collAddr.slice(0, 8),
        debtAsset: symbolMap[debtAddr] || debtAddr.slice(0, 8),
        borrower: raw.user,
        liquidator: raw.liquidator,
        collateralSeizedUSD,
        debtRepaidUSD,
        profit,
        txHash: raw.txHash,
        blockNumber: raw.blockNumber,
      }
    })
    .sort((a: any, b: any) => b.timestamp - a.timestamp)
}

// ── Background scan ──

async function backgroundScan() {
  if (scanRunning) return
  scanRunning = true
  try {
    const rawEvents = await getOrScanRawEvents()
    const tokenInfo = await getTokenMap()
    const priceMap = await getPrices(tokenInfo.addresses)
    const now = Math.floor(Date.now() / 1000)
    const currentBlock = Number(await client.getBlockNumber())
    const histPrices = await getHistoricalPrices(rawEvents, currentBlock, now)

    const events = processEvents(
      rawEvents,
      tokenInfo.symbolMap,
      tokenInfo.decimalsMap,
      tokenInfo.liqBonusMap,
      priceMap,
      histPrices,
      currentBlock,
      now
    )

    const result = { events, totalEvents: events.length }
    memResult = result
    memResultTime = Date.now()
    writeJSON(RESULT_CACHE_FILE, { ...result, timestamp: Date.now() })
    console.log(`Liquidation result cache rebuilt: ${events.length} events`)
  } catch (e: any) {
    console.error("Background liquidation scan error:", e.message)
  } finally {
    scanRunning = false
  }
}

// ── API handler ──

export async function GET() {
  // 1. Memory cache (10 min)
  if (memResult && Date.now() - memResultTime < 600_000) {
    const r = NextResponse.json(memResult)
    r.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600")
    return r
  }

  // 2. File cache (1 hour)
  const fileCached = readJSON(RESULT_CACHE_FILE)
  if (fileCached?.events && Date.now() - fileCached.timestamp < 3_600_000) {
    memResult = fileCached
    memResultTime = Date.now()
    // Kick off background update
    backgroundScan().catch(() => {})
    const r = NextResponse.json(fileCached)
    r.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600")
    return r
  }

  // 3. Build from scratch
  try {
    const [rawEvents, tokenInfo] = await Promise.all([
      getOrScanRawEvents(),
      getTokenMap(),
    ])

    const priceMap = await getPrices(tokenInfo.addresses)
    const now = Math.floor(Date.now() / 1000)
    const currentBlock = Number(await client.getBlockNumber())
    const histPrices = await getHistoricalPrices(rawEvents, currentBlock, now)

    const events = processEvents(
      rawEvents,
      tokenInfo.symbolMap,
      tokenInfo.decimalsMap,
      tokenInfo.liqBonusMap,
      priceMap,
      histPrices,
      currentBlock,
      now
    )

    const result = { events, totalEvents: events.length }
    memResult = result
    memResultTime = Date.now()
    writeJSON(RESULT_CACHE_FILE, { ...result, timestamp: Date.now() })

    const r = NextResponse.json(result)
    r.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600")
    return r
  } catch (error: any) {
    console.error("Liquidations API error:", error.shortMessage || error.message)
    if (memResult) return NextResponse.json(memResult)
    return NextResponse.json(
      { error: "Failed to fetch liquidation data", details: error.message },
      { status: 500 }
    )
  }
}
