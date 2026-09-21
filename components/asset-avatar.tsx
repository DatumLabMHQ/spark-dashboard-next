'use client';
// Asset, protocol and chain logos as shadcn Avatars. The fallback is the symbol's first two
// letters on a chart-palette tile, so a market reads the same with or without a logo.
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from '@/components/ui/avatar';

const tint = (s: string) => `var(--chart-${(Array.from(s).reduce((a, c) => a + c.charCodeAt(0), 0) % 8) + 1})`;

export function AssetAvatar({ symbol, src, className = 'size-6' }: { symbol: string; src?: string; className?: string }) {
  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback className="text-[9px] font-semibold text-white" style={{ background: tint(symbol) }}>{symbol.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

/** A market pair: collateral over loan, overlapping. */
export function MarketPair({ collateral, loan, logos, className = 'size-6' }: { collateral: string; loan: string; logos?: { collateral?: string; loan?: string }; className?: string }) {
  return (
    <AvatarGroup className="-space-x-2">
      <AssetAvatar symbol={collateral} src={logos?.collateral} className={className} />
      <AssetAvatar symbol={loan} src={logos?.loan} className={className} />
    </AvatarGroup>
  );
}
