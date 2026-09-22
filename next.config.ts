import type { NextConfig } from 'next';

/**
 * The dashboard is served at www.datumlab.xyz/sparklend, through a same-origin rewrite in the
 * DatumLabs site. It needs basePath so its own <Link>, router and static assets emit the
 * "/sparklend" prefix that survives that rewrite; an iframe was tried first and cross-origin
 * iframes to *.vercel.app get silently blocked under Chrome's tracking protection.
 *
 * NEXT_PUBLIC_BASE_PATH is set to "/sparklend" on Vercel production and left unset for local
 * `next dev`, so pages stay at the root during development.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

const config: NextConfig = {
  reactStrictMode: true,
  basePath: BASE_PATH,
  assetPrefix: BASE_PATH || undefined,
};

export default config;
