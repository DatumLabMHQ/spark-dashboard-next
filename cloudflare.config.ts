import { bindings, defineConfig, defineWorker } from "cf/config";
import { createWorkersCacheConfig } from "@vinext/cloudflare/cache/config";

const cache = await createWorkersCacheConfig();

export default defineConfig({
  accountId: "c9bf3d8e875ffe933a9bf895695e0fd1", // Datum Labs
  worker: defineWorker({
    ...cache,
    name: "spark-dashboard-next",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-07",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ...cache.env,
      ASSETS: bindings.assets(),
      // Plain settings. Secrets (DATUM_API_KEY, BEEHIIV_*) are Worker secrets.
      DATUM_API_URL: bindings.text("https://datum-api.datumlabs.workers.dev"),
    },
  }),
});
