import { NextResponse } from "next/server"
import {
  client,
  POOL_ADDRESSES_PROVIDER,
  poolAddressesProviderAbi,
  poolDataProviderAbi,
  oracleAbi,
} from "@/lib/contracts"
import { type Address } from "viem"

export const dynamic = "force-dynamic"

// In-memory cache
let cachedData: any = null
let cacheTime = 0
const CACHE_TTL = 120_000 // 2 minutes

export async function GET() {
  // Serve from cache if fresh
  if (cachedData && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json(cachedData)
  }

  try {
    // Step 1: Resolve dynamic addresses (single multicall)
    const addrResults = await client.multicall({
      contracts: [
        {
          address: POOL_ADDRESSES_PROVIDER,
          abi: poolAddressesProviderAbi,
          functionName: "getPoolDataProvider",
        },
        {
          address: POOL_ADDRESSES_PROVIDER,
          abi: poolAddressesProviderAbi,
          functionName: "getPriceOracle",
        },
      ],
    })

    const dataProviderAddr = addrResults[0].result as Address
    const oracleAddr = addrResults[1].result as Address

    // Step 2: Get all reserves
    const reserveTokens = await client.readContract({
      address: dataProviderAddr,
      abi: poolDataProviderAbi,
      functionName: "getAllReservesTokens",
    })

    const addresses = reserveTokens.map((r) => r.tokenAddress)

    // Step 3: Single giant multicall for ALL per-asset data + prices
    const contracts: any[] = []

    // Reserve data for each asset
    for (const addr of addresses) {
      contracts.push({
        address: dataProviderAddr,
        abi: poolDataProviderAbi,
        functionName: "getReserveData",
        args: [addr],
      })
    }
    // Config data for each asset
    for (const addr of addresses) {
      contracts.push({
        address: dataProviderAddr,
        abi: poolDataProviderAbi,
        functionName: "getReserveConfigurationData",
        args: [addr],
      })
    }
    // Caps for each asset
    for (const addr of addresses) {
      contracts.push({
        address: dataProviderAddr,
        abi: poolDataProviderAbi,
        functionName: "getReserveCaps",
        args: [addr],
      })
    }
    // Oracle prices (single call)
    contracts.push({
      address: oracleAddr,
      abi: oracleAbi,
      functionName: "getAssetsPrices",
      args: [addresses],
    })

    const results = await client.multicall({ contracts })

    const n = addresses.length
    const reserveDataResults = results.slice(0, n)
    const configResults = results.slice(n, 2 * n)
    const capsResults = results.slice(2 * n, 3 * n)
    const pricesResult = results[3 * n]
    const prices = (pricesResult.result || []) as bigint[]

    // Step 4: Build market rows
    const markets = reserveTokens.map((token, i) => {
      const rd = reserveDataResults[i].result as any
      const cfg = configResults[i].result as any
      const caps = capsResults[i].result as any

      if (!rd || !cfg || !caps) return null

      const price = Number(prices[i] || 0n) / 1e8
      const decimals = Number(cfg[0])
      const divisor = Math.pow(10, decimals)

      const totalSupplyRaw = Number(rd[2]) / divisor
      const totalBorrowRaw = Number(rd[3]) / divisor + Number(rd[4]) / divisor
      const totalSupply = totalSupplyRaw * price
      const totalBorrow = totalBorrowRaw * price

      const supplyAPY = Number(rd[5]) / 1e25
      const borrowAPY = Number(rd[6]) / 1e25

      const utilization =
        totalSupplyRaw > 0 ? (totalBorrowRaw / totalSupplyRaw) * 100 : 0

      return {
        symbol: token.symbol,
        address: token.tokenAddress,
        price,
        totalSupply,
        totalSupplyRaw,
        totalBorrow,
        totalBorrowRaw,
        supplyAPY,
        borrowAPY,
        utilization,
        decimals,
        supplyCap: Number(caps[1]),
        borrowCap: Number(caps[0]),
        ltv: Number(cfg[1]) / 100,
        liquidationThreshold: Number(cfg[2]) / 100,
        liquidationBonus: Number(cfg[3]) / 100 - 100,
        reserveFactor: Number(cfg[4]) / 100,
        isActive: cfg[8],
        isFrozen: cfg[9],
      }
    })

    const activeMarkets = markets.filter((m): m is NonNullable<typeof m> => m !== null && m.isActive)

    cachedData = activeMarkets
    cacheTime = Date.now()

    const response = NextResponse.json(activeMarkets)
    response.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300")
    return response
  } catch (error: any) {
    console.error("Markets API error:", error)
    // If we have stale cache, serve it
    if (cachedData) return NextResponse.json(cachedData)
    return NextResponse.json(
      { error: "Failed to fetch market data", details: error.message },
      { status: 500 }
    )
  }
}
