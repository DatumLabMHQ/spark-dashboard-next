/**
 * Where this app's own /api/* routes live.
 *
 * The dashboard is served two ways, so neither the origin nor the path prefix is a constant:
 *
 *   1. www.datumlab.xyz/sparklend/*  - a same-origin rewrite from the DatumLabs site. The app
 *      runs under basePath "/sparklend" there, so its routes answer at /sparklend/api/*.
 *   2. spark-dashboard-next.vercel.app/sparklend/*  - the raw Vercel origin, same URL shape.
 *      A direct visit to the bare root 404s by design.
 *
 * Locally `next dev` leaves NEXT_PUBLIC_BASE_PATH unset, so everything sits at the root.
 * SPARK_API_BASE overrides the origin, which is how you would point this at another instance.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

const ORIGIN =
  process.env.SPARK_API_BASE ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3022');

/** Absolute origin plus the basePath. Server-side fetch needs the whole thing. */
export const SPARK_API = `${ORIGIN}${BASE_PATH}`;
