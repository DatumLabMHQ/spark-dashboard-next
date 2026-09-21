// The normalised shapes every page reads. lib/data.ts fills them from the platform (or from
// lib/sample.ts when no key is set), so pages never depend on a resource's raw column names.
export type Point = { day: string; [k: string]: number | string };
export type Share = { name: string; value: number; color?: string };
export type Logos = { collateral?: string; loan?: string; protocol?: string; chain?: string };
export type Market = {
  id: string; protocol: string; chain: string; collateral: string; loan: string;
  supplied: number; borrowed: number; utilization: number; supply_apy: number; borrow_apy: number; lltv: number;
  risk: 'safe' | 'moderate' | 'high';
  address?: string; logos?: Logos;
};
export type Overview = {
  asOf: string; sample: boolean;
  kpis: { supplied: number; borrowed: number; suppliedChange7d: number; borrowedChange7d: number; markets: number; utilization: number; supplyApy: number };
  history: Point[]; historyGrain: 'daily' | 'weekly'; rates: Point[]; byChain: Share[]; byProtocol: Share[]; markets: Market[];
  reconciliation: { ours: number; theirs: number; theirsSource: string; note: string } | null;
};
// One market, for the detail page.
export type Fact = { label: string; value: string; note?: string };
export type Holder = { address: string; supplied: number; share: number };
export type MarketDetail = {
  asOf: string; sample: boolean;
  market: Market;
  history: Point[];                 // day, supply, borrow
  rates: Point[];                   // day, supply_apy, borrow_apy, utilization
  facts: Fact[];                    // oracle, interest-rate model, LLTV, curator, created, address
  suppliers: Holder[];              // largest suppliers
  healthBands: Share[];             // collateral by health-factor band
  healthCoverage?: { borrowers: number; pct: number };  // how much of the market's debt the sampled borrowers cover
};
