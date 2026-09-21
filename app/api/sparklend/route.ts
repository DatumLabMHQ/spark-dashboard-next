import { NextRequest, NextResponse } from "next/server"

const DEFILLAMA_URL = "https://api.llama.fi/protocol/sparklend"

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(DEFILLAMA_URL, {
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch from DefiLlama" },
        { status: 502 }
      )
    }

    const data = await res.json()

    // Extract only what we need to minimize payload
    const ethSupply = data.chainTvls?.["Ethereum"]
    const ethBorrow = data.chainTvls?.["Ethereum-borrowed"]

    if (!ethSupply || !ethBorrow) {
      return NextResponse.json(
        { error: "Missing chain data" },
        { status: 500 }
      )
    }

    const response = NextResponse.json({
      supply: {
        tokensInUsd: ethSupply.tokensInUsd,
        // Raw token units alongside the USD series. Needed to separate real flow from
        // repricing: a book can grow in dollars purely because WETH went up. Constant-price
        // change is (tokens_now - tokens_then) * price_now, and the remainder is the price effect.
        tokens: ethSupply.tokens,
        tvl: ethSupply.tvl,
      },
      borrow: {
        tokensInUsd: ethBorrow.tokensInUsd,
        tokens: ethBorrow.tokens,
        tvl: ethBorrow.tvl,
      },
      currentChainTvls: data.currentChainTvls,
    })
    response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600")
    return response
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
