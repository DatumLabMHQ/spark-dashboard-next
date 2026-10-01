/**
 * Prefix an asset in public/ with the app's basePath.
 *
 * Next applies basePath to <Link>, to the router, and to the `/_next/image` ROUTE, which is
 * enough to make it look like it handles everything. It does not:
 *
 *  - The `url` query param INSIDE an optimised image URL is passed through untouched, so
 *    `<Image src="/brand/x.png">` emits `/sparklend/_next/image?url=%2Fbrand%2Fx.png`. The
 *    optimiser then fetches `/brand/x.png` from the origin, where nothing is served, and the
 *    image 404s while the page around it looks fine.
 *  - Metadata icons are taken literally, so a favicon declared as `/brand/favicon-32.png`
 *    stays unprefixed in the <head> and never loads.
 *
 * Both failures are silent: a broken logo and a missing favicon, with no error anywhere.
 * Anything under public/ referenced by an absolute path therefore goes through here.
 *
 * Empty for local `next dev` and for any deployment served from the root, so this is a no-op
 * except where the app actually sits under a prefix. Spark is served at /sparklend.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const asset = (path: string) => `${BASE_PATH}${path}`;
