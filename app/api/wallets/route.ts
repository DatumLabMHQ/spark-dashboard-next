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
  poolAbi,
  oracleAbi,
} from "@/lib/contracts"
import { type Address, parseAbiItem } from "viem"
import { readFileSync, writeFileSync, existsSync } from "fs"
import { join } from "path"
// Bundled baseline snapshots. On Vercel the runtime filesystem is ephemeral,
// so file caches vanish on every cold start. These imports get traced into
// the serverless function bundle at build time so /wallets always has data
// to render even on a cold container. Refresh with `npm run refresh-caches`.
import positionsBaseline from "@/data/wallet-positions-baseline.json"
import usersBaseline from "@/data/wallet-users-baseline.json"

export const dynamic = "force-dynamic"
// Vercel serverless timeout in seconds. 60s is the Vercel Pro default ceiling
// (Hobby caps at 10s, Enterprise at 900s). Scans are chunked and cached so
// most invocations return fast; this budget just covers the cold-start rebuild.
export const maxDuration = 60

const DEPLOYMENT_BLOCK = 16_848_000n
const CHUNK_SIZE = 50_000n

const CACHE_DIR = process.cwd()
const USER_CACHE_FILE = join(CACHE_DIR, ".wallet-users-cache.json")
const POSITION_CACHE_FILE = join(CACHE_DIR, ".wallet-positions-cache.json")

// In-memory state
let memPositions: any = null
let memPositionsTime = 0
let quickScanRunning = false
let bgScanRunning = false

const supplyEvent = parseAbiItem(
  "event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)"
)
const borrowEvent = parseAbiItem(
  "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint256 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)"
)

// ── Cache helpers ──

function readJSON(path: string): any {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"))
  } catch (e: any) {
    console.error(`Read ${path} failed:`, e.message)
  }
  return null
}

// Fall back to the build-bundled baseline when the ephemeral fs cache is
// missing. Cast because JSON imports are typed as their literal structure
// but we treat them as our cache shape.
function readPositionsCache(): any {
  return readJSON(POSITION_CACHE_FILE) || (positionsBaseline as any)
}
function readUsersCache(): any {
  return readJSON(USER_CACHE_FILE) || (usersBaseline as any)
}

function writeJSON(path: string, data: any) {
  try {
    const safe = JSON.parse(JSON.stringify(data, (_, v) => (v === Infinity ? "Infinity" : v)))
    writeFileSync(path, JSON.stringify(safe), "utf-8")
  } catch (e: any) {
    console.error(`Write ${path} failed:`, e.message)
  }
}

function restoreInfinity(positions: any[]) {
  positions?.forEach((p: any) => {
    if (p.healthFactor === "Infinity" || p.healthFactor === null) p.healthFactor = Infinity
  })
}

// ── Scanning ──

async function scanChunk(from: bigint, to: bigint, userSet: Set<string>) {
  const [sLogs, bLogs] = await Promise.all([
    client.getLogs({ address: POOL, event: supplyEvent, fromBlock: from, toBlock: to }),
    client.getLogs({ address: POOL, event: borrowEvent, fromBlock: from, toBlock: to }),
  ])
  for (const l of sLogs) if (l.args.onBehalfOf) userSet.add(l.args.onBehalfOf.toLowerCase())
  for (const l of bLogs) if (l.args.onBehalfOf) userSet.add(l.args.onBehalfOf.toLowerCase())
}

async function scanRange(
  from: bigint,
  to: bigint,
  userSet: Set<string>,
  opts?: { saveEvery?: number; label?: string }
): Promise<bigint> {
  const saveEvery = opts?.saveEvery || 20
  let current = from
  let chunks = 0
  let lastOk = from - 1n

  while (current <= to) {
    const end = current + CHUNK_SIZE > to ? to : current + CHUNK_SIZE
    try {
      await scanChunk(current, end, userSet)
      lastOk = end
    } catch {
      // Retry with 10k sub-chunks
      let sub = current
      while (sub <= end) {
        const subEnd = sub + 10_000n > end ? end : sub + 10_000n
        try {
          await new Promise((r) => setTimeout(r, 200))
          await scanChunk(sub, subEnd, userSet)
          lastOk = subEnd
        } catch {
          lastOk = subEnd // skip on double failure
        }
        sub = subEnd + 1n
      }
    }
    current = end + 1n
    chunks++

    if (chunks % saveEvery === 0) {
      const cached = readUsersCache() || {}
      // Merge with any existing users
      const merged = new Set([...(cached.users || []), ...userSet])
      writeJSON(USER_CACHE_FILE, {
        ...cached,
        users: Array.from(merged),
        deploymentProgress: lastOk.toString(),
        timestamp: Date.now(),
      })
      console.log(`[${opts?.label || "scan"}] block ${lastOk}, ${merged.size} users`)
    }
  }
  return lastOk
}

// ── Position fetching ──

async function fetchPositions(allUsers: string[]) {
  const BATCH = 300
  const active: any[] = []

  for (let i = 0; i < allUsers.length; i += BATCH) {
    const batch = allUsers.slice(i, i + BATCH)
    try {
      const calls = batch.map((u) => ({
        address: POOL,
        abi: poolAbi,
        functionName: "getUserAccountData" as const,
        args: [u as Address],
      }))
      const results = await client.multicall({ contracts: calls })
      for (let j = 0; j < batch.length; j++) {
        const r = results[j]
        if (r.status !== "success" || !r.result) continue
        const d = r.result as any
        const col = Number(d[0]) / 1e8
        const debt = Number(d[1]) / 1e8
        const hf = Number(d[5]) / 1e18
        if (col > 0 || debt > 0) {
          active.push({
            address: batch[j],
            totalCollateral: col,
            totalDebt: debt,
            healthFactor: debt > 0 ? (hf > 1e15 ? Infinity : hf) : Infinity,
          })
        }
      }
    } catch (e: any) {
      console.warn(`Position batch ${i} failed:`, e.shortMessage || e.message)
    }
  }
  active.sort((a, b) => b.totalCollateral - a.totalCollateral)
  return active
}

async function fetchAssetBreakdown(topUsers: any[]) {
  const dpAddr = (await client.readContract({
    address: POOL_ADDRESSES_PROVIDER,
    abi: poolAddressesProviderAbi,
    functionName: "getPoolDataProvider",
  })) as Address

  const reserves = (await client.readContract({
    address: dpAddr,
    abi: poolDataProviderAbi,
    functionName: "getAllReservesTokens",
  })) as Array<{ symbol: string; tokenAddress: Address }>

  // Fetch decimals + prices in parallel with the position calls so we can
  // convert raw amounts to USD.
  const configCalls = reserves.map((t) => ({
    address: dpAddr,
    abi: poolDataProviderAbi,
    functionName: "getReserveConfigurationData" as const,
    args: [t.tokenAddress],
  }))
  const oracleAddr = (await client.readContract({
    address: POOL_ADDRESSES_PROVIDER,
    abi: poolAddressesProviderAbi,
    functionName: "getPriceOracle",
  })) as Address
  const [configs, prices] = await Promise.all([
    client.multicall({ contracts: configCalls }),
    client.readContract({
      address: oracleAddr,
      abi: oracleAbi,
      functionName: "getAssetsPrices",
      args: [reserves.map((r) => r.tokenAddress)],
    }) as Promise<bigint[]>,
  ])
  const reserveMeta = reserves.map((r, i) => {
    const decimals = Number((configs[i].result as any)?.[0] ?? 18)
    const priceUsd = Number(prices[i]) / 1e8 // SparkLend oracle returns 8-dec USD
    return { ...r, decimals, priceUsd }
  })

  const calls: any[] = []
  for (const u of topUsers)
    for (const t of reserves)
      calls.push({
        address: dpAddr,
        abi: poolDataProviderAbi,
        functionName: "getUserReserveData",
        args: [t.tokenAddress, u.address as Address],
      })

  const results: any[] = []
  for (let i = 0; i < calls.length; i += 200) {
    try {
      const r = await client.multicall({ contracts: calls.slice(i, i + 200) })
      results.push(...r)
    } catch {
      results.push(...calls.slice(i, i + 200).map(() => ({ status: "failure" })))
    }
  }

  return topUsers.map((u, ui) => {
    const col: string[] = [], bor: string[] = []
    // Per-asset USD amounts for this user: composition builder consumes these.
    const collateralUsd: Record<string, number> = {}
    const borrowUsd: Record<string, number> = {}
    for (let j = 0; j < reserves.length; j++) {
      const r = results[ui * reserves.length + j]
      if (r?.status !== "success" || !r.result) continue
      const d = r.result as any
      const meta = reserveMeta[j]
      const scale = Math.pow(10, meta.decimals)
      const collAmt = Number(d[0]) / scale
      const stableDebt = Number(d[1]) / scale
      const varDebt = Number(d[2]) / scale
      const collUsd = collAmt * meta.priceUsd
      const debtUsd = (stableDebt + varDebt) * meta.priceUsd
      if (collUsd > 0) {
        col.push(meta.symbol)
        collateralUsd[meta.symbol] = collUsd
      }
      if (debtUsd > 0) {
        bor.push(meta.symbol)
        borrowUsd[meta.symbol] = debtUsd
      }
    }
    return {
      ...u,
      collateralAssets: col,
      borrowAssets: bor,
      collateralUsd,
      borrowUsd,
    }
  })
}

// ── Background full scan from deployment ──

async function backgroundFullScan() {
  if (bgScanRunning) return
  bgScanRunning = true
  try {
    const currentBlock = await client.getBlockNumber()
    const cached = readUsersCache()
    const existingUsers = new Set<string>(cached?.users || [])
    const progress = cached?.deploymentProgress ? BigInt(cached.deploymentProgress) : DEPLOYMENT_BLOCK - 1n
    const recentStart = cached?.recentScanStart ? BigInt(cached.recentScanStart) : currentBlock

    // Scan gap: [progress+1 .. recentStart]
    if (progress < recentStart - 100n) {
      console.log(`Background scan: blocks ${progress + 1n} to ${recentStart} (${existingUsers.size} known users)`)
      const lastOk = await scanRange(progress + 1n, recentStart, existingUsers, { saveEvery: 10, label: "bg" })
      writeJSON(USER_CACHE_FILE, {
        users: Array.from(existingUsers),
        deploymentProgress: lastOk.toString(),
        recentScanStart: cached?.recentScanStart,
        timestamp: Date.now(),
      })
      console.log(`Background scan done: ${existingUsers.size} total users`)

      // Rebuild positions with new users
      const active = await fetchPositions(Array.from(existingUsers))
      const top = await fetchAssetBreakdown(active.slice(0, 100))
      const rest = active.slice(100).map((u) => ({ ...u, collateralAssets: [], borrowAssets: [] }))
      const response = {
        positions: [...top, ...rest],
        totalDiscovered: existingUsers.size,
        totalActive: active.length,
        totalCollateral: active.reduce((s, u) => s + u.totalCollateral, 0),
        totalDebt: active.reduce((s, u) => s + u.totalDebt, 0),
      }
      memPositions = response
      memPositionsTime = Date.now()
      writeJSON(POSITION_CACHE_FILE, { ...response, timestamp: Date.now() })
      console.log(`Rebuilt positions: ${active.length} active wallets`)
    }
  } catch (e: any) {
    console.error("Background scan error:", e.message)
  } finally {
    bgScanRunning = false
  }
}

// ── API handler ──

export async function GET(request: Request) {
  const url = new URL(request.url)
  const page = parseInt(url.searchParams.get("page") || "1")
  const pageSize = parseInt(url.searchParams.get("pageSize") || "50")

  function paginate(data: any) {
    const all = data.positions || []
    const start = (page - 1) * pageSize
    return NextResponse.json({
      ...data,
      positions: all.slice(start, start + pageSize),
      page,
      pageSize,
      totalPages: Math.ceil(all.length / pageSize),
      scanComplete: !bgScanRunning && !quickScanRunning,
    })
  }

  // 1. Memory cache (10 min)
  if (memPositions && Date.now() - memPositionsTime < 600_000) {
    return paginate(memPositions)
  }

  // 2. File cache — serve any prior snapshot immediately (even if stale),
  //    and kick off a background refresh. Empty page is worse than a slightly
  //    stale one; the client can retry to pull in newer data. On Vercel the
  //    fs cache is ephemeral so this falls back to the build-bundled baseline.
  const fileCached = readPositionsCache()
  if (fileCached?.positions?.length > 0) {
    const ageMs = Date.now() - (fileCached.timestamp || 0)
    const isFresh = ageMs < 3_600_000
    restoreInfinity(fileCached.positions)

    // Composition donuts on market-detail pages need per-asset USD amounts.
    // Baseline snapshots frozen before that column existed only carry the
    // symbol arrays, so re-enrich the top-100 on the first served response
    // if they're missing. Blocks the first call (~2-3s) then memoized in
    // memPositions so subsequent hits are fast.
    const top100 = fileCached.positions.slice(0, 100)
    const needsEnrichment = top100.some(
      (p: any) => !p.collateralUsd || !p.borrowUsd
    )
    if (needsEnrichment) {
      try {
        const enriched = await fetchAssetBreakdown(top100)
        fileCached.positions = [...enriched, ...fileCached.positions.slice(100)]
      } catch (e: any) {
        console.error("Baseline enrichment failed:", e.message)
      }
    }

    memPositions = fileCached
    memPositionsTime = Date.now()
    if (isFresh) {
      backgroundFullScan().catch(() => {})
    }
    return paginate(fileCached)
  }

  // 3. No position cache — build from scratch
  if (quickScanRunning) {
    // Another request is already scanning, return empty skeleton
    return NextResponse.json({
      positions: [],
      totalDiscovered: 0,
      totalActive: 0,
      totalCollateral: 0,
      totalDebt: 0,
      page: 1,
      pageSize,
      totalPages: 0,
      scanComplete: false,
    })
  }

  quickScanRunning = true
  try {
    const userCache = readUsersCache()
    let allUsers: string[] = userCache?.users || []

    if (allUsers.length === 0) {
      // Quick scan: recent 500k blocks for fast initial data
      const currentBlock = await client.getBlockNumber()
      const quickStart = currentBlock - 500_000n
      console.log(`Quick scan: blocks ${quickStart} to ${currentBlock}`)
      const userSet = new Set<string>()
      await scanRange(quickStart, currentBlock, userSet, { label: "quick" })
      allUsers = Array.from(userSet)
      writeJSON(USER_CACHE_FILE, {
        users: allUsers,
        deploymentProgress: (DEPLOYMENT_BLOCK - 1n).toString(),
        recentScanStart: quickStart.toString(),
        timestamp: Date.now(),
      })
      console.log(`Quick scan done: ${allUsers.length} users found`)
    }

    // Fetch positions
    console.log(`Fetching positions for ${allUsers.length} users...`)
    const active = await fetchPositions(allUsers)
    const top = active.length > 0 ? await fetchAssetBreakdown(active.slice(0, 100)) : []
    const rest = active.slice(100).map((u) => ({ ...u, collateralAssets: [], borrowAssets: [] }))

    const response = {
      positions: [...top, ...rest],
      totalDiscovered: allUsers.length,
      totalActive: active.length,
      totalCollateral: active.reduce((s, u) => s + u.totalCollateral, 0),
      totalDebt: active.reduce((s, u) => s + u.totalDebt, 0),
    }

    memPositions = response
    memPositionsTime = Date.now()
    writeJSON(POSITION_CACHE_FILE, { ...response, timestamp: Date.now() })

    // Start full background scan
    backgroundFullScan().catch(() => {})

    return paginate(response)
  } catch (error: any) {
    console.error("Wallets API error:", error.shortMessage || error.message)
    return NextResponse.json(
      { error: "Failed to fetch wallet data", details: error.message },
      { status: 500 }
    )
  } finally {
    quickScanRunning = false
  }
}
