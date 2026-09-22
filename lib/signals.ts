/**
 * Signals feed — the machine-readable surface the datumlabs-alerts Worker
 * reads to detect publishable findings.
 *
 * Same shape as fluid-dashboard/lib/signals.ts and euler-dashboard/lib/signals.ts
 * so the Worker parses all three lending dashboards with one reader and can
 * compare them without special-casing.
 *
 * Unlike Fluid and Euler, this repo keeps its logic inside the route handlers
 * rather than in lib/ builders, so this assembles over the existing /api/*
 * routes via HTTP — the same approach the weekly digest already uses. That
 * keeps a single derivation of every number: whatever the dashboard renders is
 * exactly what the Worker reads. In particular /api/financials is deliberately
 * first-party (Block Analitica) because DefiLlama's spark-liquidity-layer fees
 * adapter under-captures its own source; nothing here may reintroduce DefiLlama
 * as a revenue source.
 *
 * NOTE ON THE PUBLIC PATH: this app runs under basePath NEXT_PUBLIC_BASE_PATH
 * ("/sparklend" in production), so the Worker must call
 * https://spark-dashboard-next.vercel.app/sparklend/api/signals, not /api/signals.
 */

/** Public page a tweet should link to, not the raw deployment host. */
const PUBLIC_BASE = "https://www.datumlab.xyz/sparklend"

export type SignalUnit = "usd" | "pct" | "ratio" | "count"

export interface SignalMetric {
  /** Stable id. Never rename: the Worker keys its D1 history on this. */
  key: string
  label: string
  value: number
  unit: SignalUnit
  /** True only for monotonically non-decreasing running totals. Milestone-ETA
   *  forecasting runs on these alone. */
  cumulative?: boolean
  change24h?: number | null
  change30d?: number | null
  href?: string
  /** Window the decomposition below covers, in days. */
  windowDays?: number
  /** Value at the start of that window, so the Worker need not store history. */
  prior?: number
  /**
   * What moved the aggregate. Derived here rather than in the Worker because the
   * history lives here: the dashboard has years of daily per-asset series, while the
   * Worker's own store starts empty. A composition alert can therefore fire on day one.
   */
  components?: SignalComponent[]
}

export interface SignalComponent {
  /** Asset symbol, chain or product line, depending on the metric. */
  name: string
  value: number
  prior: number
  change: number
  changePct: number | null
  /** This component's share of the aggregate's total change, in percent. */
  contributionPct: number | null
  /**
   * Change with price held at today's level: (tokens_now - tokens_then) * price_now.
   * A book can grow in dollars purely because WETH went up, and saying so is the part
   * nobody else publishes. Absent when token units are unavailable.
   */
  realChange?: number
  /** The remainder: change attributable to repricing rather than flow. */
  priceEffect?: number
}

export interface SignalsPayload {
  protocol: "spark"
  fetchedAt: number
  dashboardUrl: string
  metrics: SignalMetric[]
  degraded?: string[]
}

async function fetchJson<T = unknown>(base: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${base}${path}`, { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

interface TokenPoint {
  date: number
  tokens: Record<string, number>
}

/** One point on a daily series, for the change helpers below. */
interface DayPoint {
  t: number
  v: number
}

/**
 * Absolute change over a window, computed exactly as the Fluid and Euler feeds do: current
 * minus the reading nearest to N days back, and null when the nearest reading is more than
 * three days off the target.
 *
 * The semantics have to match those feeds or a cross-protocol rule ends up comparing two
 * different things. Deltas are absolute and in the metric's own unit: USD for a book,
 * percentage POINTS for a share. Never a percentage of itself.
 */
function changesOf(series: DayPoint[]): { change24h: number | null; change30d: number | null } {
  if (!series.length) return { change24h: null, change30d: null }
  const last = series[series.length - 1]
  const at = (days: number): number | null => {
    const target = last.t - days * 86_400
    let best: DayPoint | null = null
    let gap = Infinity
    for (const point of series) {
      const d = Math.abs(point.t - target)
      if (d < gap) {
        gap = d
        best = point
      }
    }
    return best && gap <= 3 * 86_400 ? best.v : null
  }
  const delta = (days: number) => {
    const prior = at(days)
    return prior == null ? null : last.v - prior
  }
  return { change24h: delta(1), change30d: delta(30) }
}

/**
 * Lift a daily series out of one of the /api/* `daily` arrays. Rows missing either a
 * timestamp or a finite value are dropped rather than zero-filled: a gap in the series is
 * not a day the book was empty.
 */
function seriesOf<T extends { date?: number }>(
  rows: T[] | undefined,
  pick: (row: T) => number | null | undefined,
): DayPoint[] {
  if (!Array.isArray(rows)) return []
  const out: DayPoint[] = []
  for (const row of rows) {
    const t = num(row?.date)
    const v = num(pick(row))
    if (t !== null && v !== null) out.push({ t, v })
  }
  return out.sort((a, b) => a.t - b.t)
}

/**
 * The same for a series keyed by ISO date rather than a unix timestamp, dropping today's row.
 *
 * These are running totals that are still accumulating, so today's row is a partial day.
 * Differencing against it reports a fraction of a day's flow as if it were a whole one, which
 * reads as a slowdown that did not happen. Both endpoints therefore come off settled days.
 */
function settledIsoSeries<T extends { date?: string }>(
  rows: T[] | undefined,
  pick: (row: T) => number | null | undefined,
): DayPoint[] {
  if (!Array.isArray(rows)) return []
  const today = new Date().toISOString().slice(0, 10)
  const out: DayPoint[] = []
  for (const row of rows) {
    const day = typeof row?.date === "string" ? row.date.slice(0, 10) : null
    if (!day || day >= today) continue
    const t = Date.parse(`${day}T00:00:00Z`) / 1000
    const v = num(pick(row))
    if (Number.isFinite(t) && v !== null) out.push({ t, v })
  }
  return out.sort((a, b) => a.t - b.t)
}

/** The same, for the token-keyed book series, whose value is the sum across assets. */
function bookSeries(points: TokenPoint[] | undefined): DayPoint[] {
  if (!Array.isArray(points)) return []
  const out: DayPoint[] = []
  for (const p of points) {
    const t = num(p?.date)
    if (t === null) continue
    let total = 0
    for (const v of Object.values(p.tokens ?? {})) if (Number.isFinite(v)) total += v
    out.push({ t, v: total })
  }
  return out.sort((a, b) => a.t - b.t)
}

/** The series point closest to `targetTs`, so a missing day does not abort the window. */
function nearest(series: TokenPoint[], targetTs: number): TokenPoint | null {
  if (!series.length) return null
  let best = series[0]
  let bestGap = Math.abs(series[0].date - targetTs)
  for (const p of series) {
    const gap = Math.abs(p.date - targetTs)
    if (gap < bestGap) {
      best = p
      bestGap = gap
    }
  }
  // More than five days off the mark is not the window that was asked for.
  return bestGap <= 5 * 86_400 ? best : null
}

/**
 * Split an aggregate's move over `windowDays` into per-asset contributions, and where raw
 * token units exist, into real flow versus repricing.
 *
 * This is the shape of analysis a protocol publishes about itself ("USDS accounted for nearly
 * half the increase; repricing was only about 10% of it"). Running it here means the alert can
 * carry the same substance the moment the move happens.
 */
function decompose(
  usdSeries: TokenPoint[] | undefined,
  rawSeries: TokenPoint[] | undefined,
  windowDays: number,
): { value: number; prior: number; components: SignalComponent[] } | null {
  const usd = (usdSeries ?? []).filter((p) => p && typeof p.date === "number")
  if (usd.length < 2) return null
  const latest = usd[usd.length - 1]
  const then = nearest(usd, latest.date - windowDays * 86_400)
  if (!then || then.date === latest.date) return null

  const raw = (rawSeries ?? []).filter((p) => p && typeof p.date === "number")
  const rawNow = raw.length ? raw[raw.length - 1] : null
  const rawThen = raw.length ? nearest(raw, latest.date - windowDays * 86_400) : null

  const symbols = new Set([...Object.keys(latest.tokens ?? {}), ...Object.keys(then.tokens ?? {})])
  const value = Object.values(latest.tokens ?? {}).reduce((a, v) => a + (Number(v) || 0), 0)
  const prior = Object.values(then.tokens ?? {}).reduce((a, v) => a + (Number(v) || 0), 0)
  const totalChange = value - prior

  const components: SignalComponent[] = []
  for (const sym of symbols) {
    const now = Number(latest.tokens?.[sym]) || 0
    const was = Number(then.tokens?.[sym]) || 0
    const change = now - was
    if (now === 0 && was === 0) continue

    let realChange: number | undefined
    let priceEffect: number | undefined
    const tokNow = Number(rawNow?.tokens?.[sym])
    const tokThen = Number(rawThen?.tokens?.[sym])
    if (Number.isFinite(tokNow) && Number.isFinite(tokThen) && tokNow > 0 && now > 0) {
      const priceNow = now / tokNow
      realChange = (tokNow - tokThen) * priceNow
      priceEffect = change - realChange
    }

    components.push({
      name: sym,
      value: now,
      prior: was,
      change,
      changePct: was > 0 ? (change / was) * 100 : null,
      contributionPct: totalChange !== 0 ? (change / totalChange) * 100 : null,
      realChange,
      priceEffect,
    })
  }

  components.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
  return { value, prior, components }
}

/** One month of the income statement: product name -> gross and net. */
interface MonthlyRow {
  month?: string
  products?: Record<string, { gross?: number; net?: number }>
}

/** Sum the net line across every product in one monthly row. */
function monthNet(row: MonthlyRow | undefined): number {
  const products = row?.products ?? {}
  return Object.values(products).reduce(
    (a, p) => a + (Number.isFinite(p?.net) ? (p.net as number) : 0),
    0,
  )
}

/**
 * Response shapes, narrowed to just the fields this feed reads. Structural rather than exhaustive,
 * so the routes can return more without breaking the feed, and `any` stays out of the file.
 */
interface BuybacksResp {
  treasury?: { totalUSD?: number }
  threshold?: { cushionUSD?: number; cushionMonths?: number | null }
}
interface EcosystemDay {
  date?: number
  total?: number
  savings?: number
  sparklend?: number
  sll?: number
}
interface EcosystemResp {
  current?: { total?: number; savings?: number; sparklend?: number; sll?: number }
  daily?: EcosystemDay[]
}
/** One day of the six-venue Ethereum borrow book. Venues are keyed by slug, hence the index. */
interface PeersDay {
  date?: number
  total?: number
  sparkShare?: number
  [venueSlug: string]: number | undefined
}
interface PeersResp {
  currentSparkShare?: number
  daily?: PeersDay[]
  current?: Array<{ slug?: string; name?: string; borrow?: number; share?: number }>
}
interface PeerRevenueResp {
  peers?: Array<{ isSpark?: boolean; yoyPct?: number }>
  sll?: { yoyPct?: number }
}
interface BookSide {
  tokensInUsd?: TokenPoint[]
  tokens?: TokenPoint[]
}
interface FinancialsResp {
  monthly?: MonthlyRow[]
  buybackDaily?: Array<{ date?: string; totalSpkBought?: number; totalUsdsSpent?: number }>
  meta?: { latestMonthIsPartial?: boolean }
}
interface SparkLendResp {
  supply?: BookSide
  borrow?: BookSide
}
interface SpkTokenResp {
  current?: { price?: number; mcap?: number }
  daily?: Array<{ date?: number; price?: number; mcap?: number }>
}

export async function buildSignals(originBase: string): Promise<SignalsPayload> {
  const degraded: string[] = []
  const metrics: SignalMetric[] = []

  const [buybacks, ecosystem, peers, peerRevenue, financials, spkToken, book] = await Promise.all([
    fetchJson<BuybacksResp>(originBase, "/api/buybacks"),
    fetchJson<EcosystemResp>(originBase, "/api/ecosystem"),
    fetchJson<PeersResp>(originBase, "/api/peers"),
    fetchJson<PeerRevenueResp>(originBase, "/api/peer-revenue"),
    fetchJson<FinancialsResp>(originBase, "/api/financials"),
    fetchJson<SpkTokenResp>(originBase, "/api/spk-token"),
    fetchJson<SparkLendResp>(originBase, "/api/sparklend"),
  ])

  const push = (
    key: string,
    label: string,
    value: number | null,
    unit: SignalUnit,
    opts: { cumulative?: boolean; href?: string; series?: DayPoint[] } = {},
  ) => {
    if (value == null) return
    const { series, ...rest } = opts
    // A metric with a daily series behind it carries its own 24h and 30d move, so a rule
    // does not have to wait for the Worker's store to fill up before it can say anything.
    metrics.push({ key, label, value, unit, ...rest, ...(series ? changesOf(series) : {}) })
  }

  // ── Ecosystem TVL and its product split ───────────────────────────────────
  if (ecosystem?.current) {
    const c = ecosystem.current
    const eco = ecosystem.daily
    push("spark.ecosystem.tvl", "Spark ecosystem TVL", num(c.total), "usd", {
      href: PUBLIC_BASE,
      series: seriesOf(eco, (r) => r.total),
    })
    push("spark.ecosystem.savings", "Spark Savings TVL", num(c.savings), "usd", {
      href: `${PUBLIC_BASE}/savings`,
      series: seriesOf(eco, (r) => r.savings),
    })
    push("spark.ecosystem.sparklend", "SparkLend supplied", num(c.sparklend), "usd", {
      href: PUBLIC_BASE,
      series: seriesOf(eco, (r) => r.sparklend),
    })
    push("spark.ecosystem.sll", "Spark Liquidity Layer TVL", num(c.sll), "usd", {
      href: `${PUBLIC_BASE}/liquidity-layer`,
      series: seriesOf(eco, (r) => r.sll),
    })
  } else {
    degraded.push("ecosystem: unavailable")
  }

  // ── Share of Ethereum lending ─────────────────────────────────────────────
  // The cross-protocol rules will lean on this: it is computed across the same
  // six venues the Euler and Fluid feeds cover, so the three are comparable.
  if (peers) {
    push(
      "spark.lending.share_of_ethereum",
      "Spark share of Ethereum lending",
      num(peers.currentSparkShare),
      "pct",
      { href: PUBLIC_BASE, series: seriesOf(peers.daily, (r) => r.sparkShare) },
    )
    const last = Array.isArray(peers.daily) ? peers.daily[peers.daily.length - 1] : null
    push("spark.lending.borrows_ethereum", "SparkLend Ethereum borrows", num(last?.sparklend), "usd", {
      href: PUBLIC_BASE,
      series: seriesOf(peers.daily, (r) => r.sparklend),
    })

    // Cross-venue Ethereum borrow book, emitted under a NEUTRAL `market.*`
    // namespace rather than `spark.*` because it describes the whole market,
    // not Spark.
    //
    // This exists because comparing the three Datum Labs dashboards directly
    // would be apples-to-oranges: SparkLend's book here is Ethereum-only while
    // the Euler and Fluid feeds report multichain aggregates. /api/peers is one
    // source, one chain, one measure across all six venues, so shares derived
    // from it actually sum to 100% and a ranking between them means something.
    const current = Array.isArray(peers.current) ? peers.current : []
    for (const row of current) {
      if (!row?.slug) continue
      const id = String(row.slug).replace(/-/g, "_")
      // The daily rows key each venue by its raw slug, and share is derived from that day's
      // own total rather than today's, so a share move reflects that day's market.
      const slug = String(row.slug)
      push(`market.ethereum_borrows.${id}`, `${row.name} Ethereum borrows`, num(row.borrow), "usd", {
        href: PUBLIC_BASE,
        series: seriesOf(peers.daily, (r) => r[slug]),
      })
      push(`market.ethereum_share.${id}`, `${row.name} share of Ethereum lending`, num(row.share), "pct", {
        href: PUBLIC_BASE,
        series: seriesOf(peers.daily, (r) => {
          const v = num(r[slug])
          const total = num(r.total)
          return v !== null && total !== null && total > 0 ? (v / total) * 100 : null
        }),
      })
    }
  } else {
    degraded.push("peers: unavailable")
  }

  // ── Treasury and buyback runway ───────────────────────────────────────────
  if (buybacks) {
    push("spark.treasury.spendable_usd", "Spark spendable treasury", num(buybacks.treasury?.totalUSD), "usd", {
      href: `${PUBLIC_BASE}/spk`,
    })
    push("spark.buyback.cushion_usd", "Buyback cushion above threshold", num(buybacks.threshold?.cushionUSD), "usd", {
      href: `${PUBLIC_BASE}/spk`,
    })
    push(
      "spark.buyback.cushion_months",
      "Buyback runway, months",
      num(buybacks.threshold?.cushionMonths),
      "count",
      { href: `${PUBLIC_BASE}/spk` },
    )
  } else {
    degraded.push("buybacks: unavailable")
  }

  // ── SPK ───────────────────────────────────────────────────────────────────
  if (spkToken?.current) {
    push("spark.spk.price", "SPK price", num(spkToken.current.price), "usd", {
      href: `${PUBLIC_BASE}/spk`,
      series: seriesOf(spkToken.daily, (r) => r.price),
    })
    push("spark.spk.mcap", "SPK market cap", num(spkToken.current.mcap), "usd", {
      href: `${PUBLIC_BASE}/spk`,
      series: seriesOf(spkToken.daily, (r) => r.mcap),
    })
  } else {
    degraded.push("spk-token: unavailable")
  }

  // ── Revenue and cumulative buybacks ───────────────────────────────────────
  if (financials) {
    const monthly = Array.isArray(financials.monthly) ? financials.monthly : []

    // meta.latestMonthIsPartial is set because Distribution Rewards settle as a
    // monthly off-chain rebate and lag. Reading the newest month as if it were
    // complete understates revenue badly, so the reported month is the last
    // SETTLED one.
    const partial = financials.meta?.latestMonthIsPartial !== false
    const settledIdx = monthly.length - (partial ? 2 : 1)
    const settled = settledIdx >= 0 ? monthly[settledIdx] : null
    if (settled) {
      push(
        "spark.revenue.last_full_month_net",
        `Spark net revenue, ${settled.month}`,
        monthNet(settled),
        "usd",
        { href: `${PUBLIC_BASE}/financials` },
      )
    }

    const cumNet = monthly.reduce((a, m) => a + monthNet(m), 0)
    if (cumNet > 0) {
      push("spark.revenue.net_cumulative", "Spark cumulative net revenue", cumNet, "usd", {
        cumulative: true,
        href: `${PUBLIC_BASE}/financials`,
      })
    }

    // Running buyback totals arrive pre-computed on the newest row.
    const bd = Array.isArray(financials.buybackDaily) ? financials.buybackDaily : []
    const lastBuyback = bd[bd.length - 1]
    if (lastBuyback) {
      // The change fields on a running total are the flow: how much was bought back in the
      // last day and the last thirty. `value` stays the live cumulative, including today.
      push(
        "spark.buyback.spk_bought_cumulative",
        "SPK bought back, cumulative",
        num(lastBuyback.totalSpkBought),
        "count",
        {
          cumulative: true,
          href: `${PUBLIC_BASE}/spk`,
          series: settledIsoSeries(bd, (r) => r.totalSpkBought),
        },
      )
      push(
        "spark.buyback.usds_spent_cumulative",
        "USDS spent on buybacks, cumulative",
        num(lastBuyback.totalUsdsSpent),
        "usd",
        {
          cumulative: true,
          href: `${PUBLIC_BASE}/spk`,
          series: settledIsoSeries(bd, (r) => r.totalUsdsSpent),
        },
      )
    }
  } else {
    degraded.push("financials: unavailable")
  }

  // ── The Ethereum book, decomposed ─────────────────────────────────────────
  // Two windows because they answer different questions: 30d is "what is happening
  // now", 180d is the "since March" framing a protocol reaches for when it announces
  // a growth run. Both carry per-asset attribution and the repricing split.
  if (book) {
    for (const [side, series, label, href] of [
      ["borrowed", book.borrow, "SparkLend Ethereum borrowed", `${PUBLIC_BASE}`],
      ["supplied", book.supply, "SparkLend Ethereum supplied", `${PUBLIC_BASE}`],
    ] as const) {
      // Both windows describe the same book, so they share one daily aggregate and
      // therefore one 24h and 30d move. Only the decomposition differs.
      const moves = changesOf(bookSeries(series?.tokensInUsd))
      for (const windowDays of [30, 180]) {
        const d = decompose(series?.tokensInUsd, series?.tokens, windowDays)
        if (!d) continue
        metrics.push({
          key: `spark.book.${side}_${windowDays}d`,
          // The window is carried in `windowDays`; rules add it to their own copy, so
          // repeating it here produced "borrowed, 30d +32.7% over 30d".
          label,
          value: d.value,
          unit: "usd",
          ...moves,
          windowDays,
          prior: d.prior,
          components: d.components,
          href,
        })
      }
    }
  } else {
    degraded.push("sparklend book: unavailable")
  }

  // ── Revenue growth vs the peer set ────────────────────────────────────────
  if (peerRevenue) {
    const list = Array.isArray(peerRevenue.peers) ? peerRevenue.peers : []
    const sparkRow = list.find((p) => p?.isSpark)

    // SparkLend's interest income and the Liquidity Layer's are emitted
    // SEPARATELY and on purpose. They diverge hard — SparkLend has been
    // strongly positive while the SLL line has been deeply negative over the
    // same 90d window. A rule that saw only the first would publish "Spark
    // revenue up N%" while the liquidity layer was bleeding. Any rule quoting
    // one of these must have the other in hand.
    push(
      "spark.revenue.sparklend_yoy_pct",
      "SparkLend interest income, 90d vs prior 90d",
      num(sparkRow?.yoyPct),
      "pct",
      { href: `${PUBLIC_BASE}/financials` },
    )
    push(
      "spark.revenue.sll_yoy_pct",
      "Spark Liquidity Layer revenue, 90d vs prior 90d",
      num(peerRevenue.sll?.yoyPct),
      "pct",
      { href: `${PUBLIC_BASE}/financials` },
    )
  } else {
    degraded.push("peer-revenue: unavailable")
  }

  return {
    protocol: "spark",
    fetchedAt: Math.floor(Date.now() / 1000),
    dashboardUrl: PUBLIC_BASE,
    metrics,
    ...(degraded.length ? { degraded } : {}),
  }
}
