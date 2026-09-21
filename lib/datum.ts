// Server-side client for datum-api. The key never reaches the browser: every read happens in a
// server component or route handler. Responses are cached for five minutes per URL.
const BASE = (process.env.DATUM_API_URL || 'https://datum-api-datumlabs1.vercel.app').replace(/\/$/, '');

export const hasKey = () => Boolean(process.env.DATUM_API_KEY);

async function get<T>(path: string): Promise<T> {
  const key = process.env.DATUM_API_KEY;
  if (!key) throw new Error('DATUM_API_KEY is not set');
  const res = await fetch(`${BASE}${path}`, { headers: { 'x-api-key': key, accept: 'application/json' }, next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`datum-api ${path} -> HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export type Rows = { resource: string; table: string; day: string | null; count: number; as_of: string | null; rows: Record<string, unknown>[] };
export type Answer = { id: string; question: string; date: string; value: number | null; label?: string | null; unit: string; sql: string };
export type Health = { ok: boolean; last_build: string | null; problems: string[] };

const qs = (params: Record<string, string | number | boolean | undefined>) =>
  Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');

/** Rows from one resource. Daily tables default to the latest day; pass day or since/until. */
export function query(product: string, resource: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<Rows> {
  const q = qs(params); return get<Rows>(`/api/v1/${product}/${resource}${q ? '?' + q : ''}`);
}
/** One canonical question, for a date (default latest). */
export function ask(id: string, date?: string): Promise<Answer> {
  return get<Answer>(`/api/v1/ask/${id}${date ? `?date=${date}` : ''}`);
}
export function health(): Promise<Health> { return get<Health>('/api/v1/health'); }
