'use client';
// Item lists for the methodology page. Client because shadcn's Item keeps context; the rows arrive
// as plain props from the server page.
import { ClockIcon, DatabaseIcon, FlaskIcon, GlobeIcon, PulseIcon, ScalesIcon, ShieldCheckIcon, TimerIcon } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from '@/components/ui/item';

export type SourceRow = { name: string; role: 'headline' | 'comparison'; cadence: string; detail: string };
export type StatusRow = { icon: 'platform' | 'clock' | 'timer' | 'pulse' | 'scales' | 'shield' | 'flask'; label: string; detail: string; badge?: { text: string; tone?: 'ok' | 'warn' | 'bad' | 'info' | 'neutral' } };

const TONE = { ok: 'text-(--green)', warn: 'text-(--yellow)', bad: 'text-(--red)', info: 'text-(--brand-blue)', neutral: 'text-muted-foreground' } as const;
const ICON = { platform: <DatabaseIcon />, clock: <ClockIcon />, timer: <TimerIcon />, pulse: <PulseIcon />, scales: <ScalesIcon />, shield: <ShieldCheckIcon />, flask: <FlaskIcon /> } as const;

export function SourceList({ sources }: { sources: SourceRow[] }) {
  return (
    <ItemGroup>
      {sources.map((s, i) => (
        <div key={s.name}>
          {i > 0 ? <ItemSeparator /> : null}
          <Item size="sm">
            <ItemMedia variant="icon">{s.role === 'headline' ? <DatabaseIcon /> : <GlobeIcon />}</ItemMedia>
            <ItemContent>
              <ItemTitle>{s.name}</ItemTitle>
              <ItemDescription className="line-clamp-none">{s.detail}</ItemDescription>
            </ItemContent>
            <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
              <Badge variant="outline" className={s.role === 'headline' ? 'text-(--green)' : 'text-muted-foreground'}>{s.role === 'headline' ? 'headline' : 'comparison only'}</Badge>
              <span className="text-xs text-muted-foreground">{s.cadence}</span>
            </div>
          </Item>
        </div>
      ))}
    </ItemGroup>
  );
}

export function StatusList({ rows }: { rows: StatusRow[] }) {
  return (
    <ItemGroup>
      {rows.map((r, i) => (
        <div key={r.label}>
          {i > 0 ? <ItemSeparator /> : null}
          <Item size="sm">
            <ItemMedia variant="icon">{ICON[r.icon]}</ItemMedia>
            <ItemContent>
              <ItemTitle>{r.label}</ItemTitle>
              <ItemDescription className="line-clamp-none">{r.detail}</ItemDescription>
            </ItemContent>
            {r.badge ? <Badge variant="outline" className={`ml-auto shrink-0 ${TONE[r.badge.tone ?? 'neutral']}`}><span className="size-1.5 rounded-full bg-current" />{r.badge.text}</Badge> : null}
          </Item>
        </div>
      ))}
    </ItemGroup>
  );
}
