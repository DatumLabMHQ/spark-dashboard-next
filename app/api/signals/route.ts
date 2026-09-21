import { NextResponse } from "next/server"
import { buildSignals } from "@/lib/signals"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET /api/signals  (served at /sparklend/api/signals under basePath)
 *
 * Machine-readable metric feed for the datumlabs-alerts Worker. Public and
 * key-free: it exposes nothing the dashboard doesn't already render.
 *
 * Assembles over this app's own /api/* routes, so the origin has to be derived
 * from the incoming request and must preserve basePath — the same thing
 * /api/weekly-digest does. Getting this wrong yields an empty payload rather
 * than an error, which is why every sub-fetch failure is reported in
 * `degraded` instead of being swallowed.
 */
function originFromRequest(request: Request): string {
  const url = new URL(request.url)
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
  return `${url.protocol}//${url.host}${basePath}`
}

export async function GET(request: Request) {
  try {
    const payload = await buildSignals(originFromRequest(request))
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    })
  } catch (e: any) {
    return NextResponse.json(
      { protocol: "spark", fetchedAt: Math.floor(Date.now() / 1000), metrics: [], error: e?.message ?? "failed" },
      { status: 503 },
    )
  }
}
