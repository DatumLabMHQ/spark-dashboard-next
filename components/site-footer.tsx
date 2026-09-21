// Provenance, on every page: where the numbers come from and when they were taken.
import { config } from '@/datum.config';
import { platformStatus } from '@/lib/platform';

export async function SiteFooter() {
  const s = await platformStatus();
  // A dashboard reading its own loaders must not claim datum-api. Name what it actually reads.
  const own = config.sources.map((x) => x.name).join(', ');
  const provenance =
    s.source === 'dashboard'
      ? `Every number on this page is read by this dashboard from ${own || 'its own sources'}. Definitions and the reconciliation note are on the methodology page; disagreements are logged, not hidden.`
      : 'Every number on this page comes from the Datum data platform’s curated tables, read through datum-api. Definitions live in datum-context; disagreements with other sources are logged, not hidden.';
  // The dashboard's own as-of belongs to its data, and the page prints it in the answer line.
  const stamp =
    s.source === 'dashboard' ? 'Datum Labs' : `${s.sample ? 'Sample data' : `As of ${s.asOf ?? 'n/a'} UTC`} · Datum Labs`;
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t px-4 py-4 text-xs text-muted-foreground lg:px-6">
      <span className="max-w-[80ch]">{provenance}</span>
      <span className="tabular-nums">{stamp}</span>
    </footer>
  );
}
