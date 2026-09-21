// Methodology: what the dashboard measures, where the numbers come from, what the terms mean, how
// fresh they are, and how they reconcile. Cards with Item lists and a table, like every other page,
// so it reads as part of the dashboard rather than a text column beside it.
import { config } from '@/datum.config';
import { loadOverview } from '@/lib/data';
import { platformStatus } from '@/lib/platform';
import { pct, usd } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SourceList, StatusList, type StatusRow } from '@/components/methodology-lists';

export const revalidate = 300;
export const metadata = { title: 'Methodology' };

export default async function Methodology() {
  const [s, d] = await Promise.all([platformStatus(), loadOverview()]);
  const platform: StatusRow = s.source === 'dashboard'
    ? { icon: 'platform', label: 'Read by this dashboard', detail: 'This product is not on the Datum data platform yet, so the dashboard reads its own sources directly. They are listed below, and the numbers are live, not sample.', badge: { text: 'own sources', tone: 'ok' } }
    : s.sample
    ? { icon: 'flask', label: 'Sample data', detail: 'No platform key is set, so every number is generated and labelled. Nothing on this instance is a live figure.', badge: { text: 'sample', tone: 'info' } }
    : s.ok === null ? { icon: 'platform', label: 'Platform unreachable', detail: 'datum-api did not answer; the pages show their last cached render.', badge: { text: 'unreachable', tone: 'bad' } }
    : { icon: 'platform', label: s.ok ? 'Platform healthy' : 'Platform degraded', detail: s.ok ? 'Every source job ran on schedule and every table is fresh.' : 'At least one source is stale or a job failed; the health endpoint lists which. Numbers may lag.', badge: { text: s.ok ? 'healthy' : 'degraded', tone: s.ok ? 'ok' : 'warn' } };
  const status: StatusRow[] = [
    platform,
    { icon: 'clock', label: s.source === 'dashboard' ? 'Data as of' : 'Last platform build', detail: s.source === 'dashboard' ? 'The latest day present in the dashboard’s own data, in UTC.' : 'When the modelled tables were last rebuilt from the raw snapshots, in UTC.', badge: { text: s.source === 'dashboard' ? d.asOf : s.sample ? d.asOf : (s.asOf ?? 'n/a'), tone: 'neutral' } },
    { icon: 'timer', label: 'Snapshot and refresh cadence', detail: 'Sources are snapshotted hourly; these pages revalidate every five minutes, so a number is at most about an hour behind the chain.' },
    { icon: 'pulse', label: 'Trend window', detail: `${config.trend.days} days back from the latest day, sampled ${d.historyGrain} from our own count. Each point is one read of every listed market on that day.`, badge: { text: `${d.history.length} points`, tone: 'neutral' } },
    { icon: 'shield', label: 'Dashboard status', detail: config.status === 'draft' ? 'The brief is not signed off and the reconciliation is not logged, so this dashboard is not embedded or shared yet.' : 'The brief is signed off and the reconciliation is logged.', badge: { text: config.status, tone: config.status === 'live' ? 'ok' : 'warn' } },
  ];
  const r = d.reconciliation;
  return (
    <>
      <PageHeader eyebrow="Methodology" question="Where do these numbers come from?"
        answer={<>{config.description} The overview answers one question: {config.question.charAt(0).toLowerCase() + config.question.slice(1)} Every other page is a drill-down on that.</>} />
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Sources</CardTitle><CardDescription>What is read and how often. Our own count is the headline; anything else is stored beside it for comparison and never averaged in.</CardDescription></CardHeader>
          <CardContent className="px-2"><SourceList sources={config.sources} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Freshness and status</CardTitle><CardDescription>How current the numbers are right now, and whether this dashboard may be shared.</CardDescription></CardHeader>
          <CardContent className="px-2"><StatusList rows={status} /></CardContent>
        </Card>
        <Card className="@4xl/main:col-span-2">
          <CardHeader><CardTitle>Definitions</CardTitle><CardDescription>The terms used on every page, with their units. A number on a page means exactly this and nothing else.</CardDescription></CardHeader>
          <CardContent className="px-0">
            <div className="border-t">
              <Table>
                <TableHeader className="bg-muted"><TableRow><TableHead className="w-40 pl-6">Term</TableHead><TableHead className="w-24">Unit</TableHead><TableHead className="pr-6">Definition</TableHead></TableRow></TableHeader>
                <TableBody>{config.definitions.map((x) => (
                  <TableRow key={x.term}><TableCell className="pl-6 font-medium">{x.term}</TableCell><TableCell className="text-muted-foreground">{x.unit}</TableCell><TableCell className="whitespace-normal pr-6 text-muted-foreground">{x.text}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <Card className="@4xl/main:col-span-2">
          <CardHeader><CardTitle>Reconciliation</CardTitle><CardDescription>Our own count beside the figure another source publishes for the same thing, with the cause of the gap. Disagreements are logged in datum-context, never hidden or averaged away.</CardDescription></CardHeader>
          <CardContent>
            {r ? (
              <div className="grid grid-cols-1 gap-4 @2xl/main:grid-cols-[1fr_1fr_2fr]">
                <div className="rounded-lg border bg-muted/40 p-4"><div className="text-xs text-muted-foreground">Our count, supplied</div><div className="mt-1 text-2xl font-medium tracking-tight tabular-nums">{usd(r.ours)}</div><div className="mt-1 text-xs text-muted-foreground">as of {d.asOf}</div></div>
                <div className="rounded-lg border bg-muted/40 p-4"><div className="text-xs text-muted-foreground">{r.theirsSource}</div><div className="mt-1 text-2xl font-medium tracking-tight tabular-nums">{usd(r.theirs)}</div><div className="mt-1 text-xs text-muted-foreground">{r.theirs >= r.ours ? `${pct((r.theirs / r.ours - 1) * 100, 1)} above ours` : `${pct((1 - r.theirs / r.ours) * 100, 1)} below ours`}</div></div>
                <p className="self-center text-sm text-muted-foreground">{r.note}</p>
              </div>
            ) : <p className="text-sm text-muted-foreground">No comparison source is configured for this product yet, so the headline stands alone. Add one under <span className="font-mono text-xs">resources.comparison</span> in datum.config.ts.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
