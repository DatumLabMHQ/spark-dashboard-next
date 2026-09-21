'use client';
// Search and jump: shadcn Command in a dialog, opened from the header button or cmd+k.
// Groups: the pages from datum.config.ts and whatever the dashboard's lib/data.ts offers as searchItems
// (markets, assets, reserves...).
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { BookOpenIcon, MagnifyingGlassIcon, SquaresFourIcon, TableIcon, VaultIcon } from '@phosphor-icons/react';
import { config } from '@/datum.config';
import { Button } from '@/components/ui/button';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command';

import type { SearchItem } from '@/lib/platform';
const ICONS: Record<string, React.ReactNode> = { '/': <SquaresFourIcon />, '/markets': <TableIcon />, '/vaults': <VaultIcon />, '/methodology': <BookOpenIcon /> };

export function CommandMenu({ items }: { items: SearchItem[] }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen((o) => !o); } };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);
  const go = (href: string) => { setOpen(false); router.push(href); };
  return (
    <>
      <Button variant="outline" size="sm" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <MagnifyingGlassIcon /><span className="hidden md:inline">Search</span>
        <kbd className="pointer-events-none ml-1 hidden rounded border bg-muted px-1.5 font-mono text-[10px] font-medium md:inline-block">⌘K</kbd>
      </Button>
      {open ? <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Jump to a page or a market">
        <Command>
          <CommandInput placeholder="Search pages and markets" />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandGroup heading="Pages">
              {config.nav.map((n) => (
                <CommandItem key={n.href} value={`page ${n.label}`} onSelect={() => go(n.href)}>{ICONS[n.href] ?? <SquaresFourIcon />}<span>{n.label}</span></CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Search">
              {items.map((m) => (
                <CommandItem key={m.href} value={`${m.label} ${m.hint ?? ''}`} onSelect={() => go(m.href)}>
                  <TableIcon /><span>{m.label}</span>{m.hint ? <CommandShortcut>{m.hint}</CommandShortcut> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog> : null}
    </>
  );
}
