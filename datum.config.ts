// The only file most dashboards need to edit. Name the product, the platform resources the pages
// read, how their columns map onto the normalised shapes in lib/types.ts, and the navigation.
// lib/data.ts and the components do the rest. Without DATUM_API_KEY the pages run on labelled sample data.

// `datum new dashboard` fills the {{placeholders}}. Until then the template runs as the reference
// dashboard under these fallbacks, so it can be opened and judged as is.
const ph = (v: string, fallback: string) => (v.startsWith('{{') && v.endsWith('}}') ? fallback : v);

export const config = {
  // 'draft' until `datum check <slug>` prints READY and the owner signs the brief; the page says so.
  status: 'live' as 'draft' | 'live',
  // Where this dashboard's numbers come from, so the frame's provenance copy tells the truth.
  //   'platform'  — datum-api, falling back to labelled sample data when no key is set. The default.
  //   'dashboard' — the dashboard's own loaders, for a product the platform does not carry yet.
  //                 Real numbers, so the frame must not call them sample, and the footer names the
  //                 entries in `sources` below instead of claiming datum-api.
  dataSource: 'dashboard' as 'platform' | 'dashboard',
  slug: ph('spark-dashboard-next', 'reference-dashboard'),
  title: ph('Spark Research Terminal', 'State of lending'),
  description: ph('Spark ecosystem, SparkLend, the Liquidity Layer and SPK, built by Datum Labs.', 'The reference dashboard for Datum Labs: the standard look and structure, running on labelled sample data until a platform key is set.'),
  // The question the overview answers. Pages lead with it.
  question: 'How much of Spark is SparkLend, and how much is everything else?',
  // The product the markets belong to, as shown on the page and used for its logo.
  product: { slug: 'spark', label: 'SparkLend', defillamaSlug: 'sparklend' },
  // Resources are product/name pairs from GET /api/v1/products on datum-api. `filters` must be
  // filters that resource declares (see /api/v1/products); anything else is ignored by the API.
  resources: {
    // One row per chain, market and UTC day. Latest day by default; `day=` or `since=` for history.
    markets: { product: 'morpho', name: 'markets', filters: { listed: 'true' } as Record<string, string> },
    // The positions sample (largest suppliers and borrowers per market, twice a day) and its health bands.
    // When the platform does not serve them yet, the market page hides those two cards.
    positions: { product: 'morpho', name: 'positions' },
    health: { product: 'morpho', name: 'health' },
    // DefiLlama's own figure for the same protocol, stored beside ours for the reconciliation note.
    comparison: { product: 'defillama', name: 'tvl', filters: { slug: 'morpho-blue' } as Record<string, string> },
  },
  // Column names in the markets resource for each normalised field (lib/types.ts Market), and
  // which of them the resource stores as fractions (0.86) rather than percent (86).
  fields: {
    id: 'market_id', chain: 'chain_id', collateral: 'collateral_symbol', loan: 'loan_symbol',
    supplied: 'supply_assets_usd', borrowed: 'borrow_assets_usd', utilization: 'utilization', supply_apy: 'supply_apy', borrow_apy: 'borrow_apy', lltv: 'lltv', day: 'day',
    // extra columns shown on the market page when present
    liquidity: 'liquidity_assets_usd', collateralValue: 'collateral_assets_usd', badDebt: 'bad_debt_usd', fee: 'fee_pct', address: 'market_id',
  },
  fractions: ['lltv'] as string[],
  // How far back the overview trend goes, and how often it samples our own count (one API call
  // per point, so weekly points keep it to about a dozen calls).
  trend: { days: 90, stepDays: 7 },
  // The sign-in gate: the overview is open to everyone; every other page asks once for a name, an email
  // and an occupation (kept on that browser). Leads join the Datum Labs list through app/api/gate.
  gate: { enabled: true, free: ['/'] as string[] },
  nav: [
    { href: '/', label: 'Overview' },
    { href: '/markets', label: 'Markets' },
    { href: '/book', label: 'Loan book' },
    { href: '/financials', label: 'Financials' },
    { href: '/liquidity-layer', label: 'Liquidity Layer' },
    { href: '/savings', label: 'Savings' },
    { href: '/liquidations', label: 'Liquidations' },
    { href: '/spk', label: 'SPK' },
    { href: '/methodology', label: 'Methodology' },
  ],
  // Shown on the methodology page. Keep them honest: what is read, how often, what it excludes.
  // role: 'headline' is our own count; 'comparison' is stored beside it and never the headline.
  sources: [
    { name: 'The Spark terminal API', role: 'headline' as 'headline' | 'comparison', cadence: 'every 5 minutes', detail: 'Reserve-level supply and borrow read on chain, and the ecosystem series. Read from the existing Spark terminal so there is one derivation of every number.' },
    { name: 'Block Analitica (data.spark.finance)', role: 'headline' as 'headline' | 'comparison', cadence: 'daily', detail: 'First-party Spark financials. DefiLlama is not used for Spark revenue: its spark-liquidity-layer adapter under-captures its own source and turns a positive month negative.' },
  ],
  definitions: [
    { term: 'Supplied', unit: 'USD', text: 'Value supplied to SparkLend reserves on Ethereum at the latest read.' },
    { term: 'Borrowed', unit: 'USD', text: 'Outstanding debt in those reserves.' },
    { term: 'Ecosystem total', unit: 'USD', text: 'SparkLend plus Spark Savings plus the Spark Liquidity Layer. Larger than the reserve book because the other two are separate businesses.' },
    { term: 'Utilisation', unit: '%', text: 'Borrowed divided by supplied, per reserve and in aggregate.' },
    { term: 'LLTV', unit: '%', text: 'The markets route serves ltv as 0 and liquidationThreshold unscaled, so neither is publishable and both read n/a rather than asserting a false risk parameter.' },
  ],
};
export type DatumConfig = typeof config;
