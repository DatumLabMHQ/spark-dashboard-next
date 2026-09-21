// Kit file: the platform status every dashboard's frame shows. Shared by the header badge, the
// status banner, the footer and the methodology page; wrapped in cache() so one request reads it once.
import { cache } from 'react';
import { hasKey, health } from './datum';
import { config } from '@/datum.config';

export type PlatformStatus = { sample: boolean; ok: boolean | null; asOf: string | null; source: 'platform' | 'dashboard' };
export const SAMPLE_AS_OF = '2026-09-15';

export const platformStatus = cache(async (): Promise<PlatformStatus> => {
  // A dashboard on its own loaders is neither sample data nor the platform. Its freshness comes
  // from its own data, which the page prints in its answer line, so asOf is left null here rather
  // than borrowing the platform's build time.
  // Read as optional: a dashboard written before this key existed simply reads the platform, as it always did.
  if ((config as { dataSource?: 'platform' | 'dashboard' }).dataSource === 'dashboard') return { sample: false, ok: true, asOf: null, source: 'dashboard' };
  if (!hasKey()) return { sample: true, ok: null, asOf: SAMPLE_AS_OF, source: 'platform' };
  try { const h = await health(); return { sample: false, ok: h.ok, asOf: h.last_build ? h.last_build.slice(0, 16).replace('T', ' ') : null, source: 'platform' }; }
  catch { return { sample: false, ok: null, asOf: null, source: 'platform' }; }
});

/** The kit's own pages (chart guide) show in sample mode or when NEXT_PUBLIC_SHOW_KIT=true. */
export const showKit = (s: PlatformStatus) => s.sample || process.env.NEXT_PUBLIC_SHOW_KIT === 'true';

/** What the frame asks a dashboard's lib/data.ts for, beyond its own pages' loaders. */
export type SearchItem = { label: string; href: string; hint?: string };
export type NavChild = { label: string; href: string };
export type FrameData = {
  /** Rows for the cmd+k palette under "Search" (markets, assets, reserves...). */
  searchItems: () => Promise<SearchItem[]>;
  /** Counts shown as badges next to nav entries, by href. */
  navBadges: () => Promise<Record<string, number>>;
  /** The rows listed under a nav entry when it is opened in the sidebar, by href (every market under
   *  Markets, every vault under Vaults). The sidebar shows the first NAV_CHILDREN_MAX and a link to the rest. */
  navChildren: () => Promise<Record<string, NavChild[]>>;
};
export const NAV_CHILDREN_MAX = 12;
