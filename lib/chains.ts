// Chain ids the platform stores, with a display name and a logo where one is public. Unknown ids
// render as "Chain <id>" with an initials tile, so a new chain never breaks a page.
const ICON = 'https://icons.llamao.fi/icons/chains';
export const CHAINS: Record<number, { name: string; slug?: string }> = {
  1: { name: 'Ethereum', slug: 'ethereum' }, 8453: { name: 'Base', slug: 'base' }, 42161: { name: 'Arbitrum', slug: 'arbitrum' },
  10: { name: 'Optimism', slug: 'optimism' }, 137: { name: 'Polygon', slug: 'polygon' }, 43114: { name: 'Avalanche', slug: 'avalanche' },
  130: { name: 'Unichain', slug: 'unichain' }, 143: { name: 'Monad', slug: 'monad' }, 999: { name: 'HyperEVM', slug: 'hyperliquid' },
  747474: { name: 'Katana', slug: 'katana' }, 4663: { name: 'Robinhood Chain' }, 480: { name: 'World Chain', slug: 'world chain' },
  146: { name: 'Sonic', slug: 'sonic' }, 252: { name: 'Fraxtal', slug: 'fraxtal' }, 534352: { name: 'Scroll', slug: 'scroll' }, 100: { name: 'Gnosis', slug: 'xdai' },
  56: { name: 'BNB Chain', slug: 'binance' }, 5000: { name: 'Mantle', slug: 'mantle' }, 59144: { name: 'Linea', slug: 'linea' },
  988: { name: 'Stable', slug: 'stable' }, 4217: { name: 'Tempo' }, 5042: { name: 'Arc', slug: 'arc' },
};
export const chainName = (id: number | string) => CHAINS[Number(id)]?.name ?? `Chain ${id}`;
// Logos shipped with the kit (public/brand/logos) are served locally; others come from DefiLlama's CDN.
const LOCAL_CHAINS = new Set(['ethereum', 'base', 'arbitrum', 'optimism', 'avalanche', 'polygon', 'unichain']);
const LOCAL_PROTOCOLS = new Set(['aave', 'morpho-blue', 'compound-finance']);
export const chainLogo = (id: number | string) => {
  const s = CHAINS[Number(id)]?.slug; if (!s) return undefined;
  return LOCAL_CHAINS.has(s) ? `/brand/logos/chain-${s}.webp` : `${ICON}/rsz_${s.replace(/ /g, '%20')}.jpg`;
};
export const protocolLogo = (slug: string) => (LOCAL_PROTOCOLS.has(slug) ? `/brand/logos/${slug}.webp` : `https://icons.llamao.fi/icons/protocols/${slug}?w=48&h=48`);
