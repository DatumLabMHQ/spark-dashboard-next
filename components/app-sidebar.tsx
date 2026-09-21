'use client';
// The left pane: shadcn Sidebar, inset variant, collapsing to icons (cmd+b). Navigation is data:
// pages come from datum.config.ts, and a page's rows (every market, every vault...) come from the
// dashboard's navChildren() and open under it as a shadcn Collapsible: the label goes to the page,
// the chevron opens the list, and the list opens by itself on that page. The kit's own pages (KIT)
// show only in sample mode or with NEXT_PUBLIC_SHOW_KIT=true. Icons are Phosphor only.
import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowSquareOutIcon, ArrowsLeftRightIcon, BankIcon, BookOpenIcon, CaretRightIcon, ChartLineUpIcon, CoinsIcon, DropIcon, GlobeHemisphereWestIcon, LightningIcon, SquaresFourIcon, StackIcon, TableIcon, TagIcon, UsersThreeIcon, VaultIcon } from '@phosphor-icons/react';
import { config } from '@/datum.config';
import { NAV_CHILDREN_MAX, type NavChild } from '@/lib/platform';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuAction,
  SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail,
} from '@/components/ui/sidebar';

// Icons by route. A dashboard's own routes fall back to the grid icon; add them here when they recur.
const ICONS: Record<string, React.ReactNode> = { '/': <SquaresFourIcon />, '/markets': <TableIcon />, '/vaults': <VaultIcon />, '/horizon': <BankIcon />, '/assets': <CoinsIcon />, '/curators': <UsersThreeIcon />, '/chains': <GlobeHemisphereWestIcon />, '/pools': <DropIcon />, '/reserves': <CoinsIcon />, '/tokens': <TagIcon />, '/flows': <ArrowsLeftRightIcon />, '/liquidations': <LightningIcon />, '/protocols': <StackIcon />, '/methodology': <BookOpenIcon /> };
const KIT = [{ href: '/kit/charts', label: 'Chart guide', icon: <ChartLineUpIcon /> }];

export function AppSidebar({ badges = {}, subnav = {}, showKit = false, ...props }: React.ComponentProps<typeof Sidebar> & { badges?: Record<string, number>; subnav?: Record<string, NavChild[]>; showKit?: boolean }) {
  const path = usePathname();
  const active = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="data-[slot=sidebar-menu-button]:p-1.5!" render={<Link href="/" />}>
              <Image src="/brand/datum-mark.png" alt="" width={24} height={24} className="size-6 shrink-0 rounded-[6px]" priority />
              <span className="text-base font-semibold">datum<span className="text-(--brand-blue)">labs</span></span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Pages</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {config.nav.map((n) => {
                const rows = subnav[n.href] ?? [];
                const button = (
                  <SidebarMenuButton tooltip={n.label} isActive={active(n.href)} render={<Link href={n.href} />}>
                    {ICONS[n.href] ?? <SquaresFourIcon />}<span>{n.label}</span>
                  </SidebarMenuButton>
                );
                if (!rows.length) return (
                  <SidebarMenuItem key={n.href}>{button}{badges[n.href] ? <SidebarMenuBadge>{badges[n.href]}</SidebarMenuBadge> : null}</SidebarMenuItem>
                );
                return (
                  <Collapsible key={n.href} defaultOpen={active(n.href)} className="group/collapsible" render={<SidebarMenuItem />}>
                    {button}
                    {badges[n.href] ? <SidebarMenuBadge className="right-7">{badges[n.href]}</SidebarMenuBadge> : null}
                    <CollapsibleTrigger render={<SidebarMenuAction showOnHover={false} aria-label={`Open ${n.label.toLowerCase()} list`} />}>
                      <CaretRightIcon className="transition-transform group-data-[open]/collapsible:rotate-90" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {rows.slice(0, NAV_CHILDREN_MAX).map((r) => (
                          <SidebarMenuSubItem key={r.href}>
                            <SidebarMenuSubButton size="sm" isActive={path === r.href} render={<Link href={r.href} />}><span className="truncate">{r.label}</span></SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                        {rows.length > NAV_CHILDREN_MAX ? (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton size="sm" render={<Link href={n.href} />}><span className="text-muted-foreground">All {rows.length} {n.label.toLowerCase()}</span></SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ) : null}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{showKit ? 'Kit' : 'Datum'}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {showKit ? KIT.map((n) => (
                <SidebarMenuItem key={n.href}>
                  <SidebarMenuButton tooltip={n.label} isActive={active(n.href)} render={<Link href={n.href} />}>{n.icon}<span>{n.label}</span></SidebarMenuButton>
                </SidebarMenuItem>
              )) : null}
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="datumlab.xyz" render={<a href="https://www.datumlab.xyz" target="_blank" rel="noreferrer" />}><ArrowSquareOutIcon /><span>datumlab.xyz</span></SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="truncate px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{config.title}</div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
