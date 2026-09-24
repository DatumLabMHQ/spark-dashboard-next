# Spark Research Terminal

The SparkLend / Spark Liquidity Layer / Savings research terminal, rebuilt on
[datum-databuild-kit](https://github.com/DatumLabMHQ/datum-databuild-kit).

Served at **https://www.datumlab.xyz/sparklend**, through a same-origin rewrite in the
DatumLabs site rather than an iframe. It therefore runs under `basePath` `/sparklend`, set
via `NEXT_PUBLIC_BASE_PATH` on Vercel production and left unset for local `next dev`.

The overview is open to everyone; every other page is behind the sign-in gate.

Pushing to `master` deploys to production.

---

# Spark Research Terminal

Spark ecosystem, SparkLend, the Liquidity Layer and SPK, built by Datum Labs.

Built with [datum-databuild-kit](https://github.com/DatumLabMHQ/datum-databuild-kit). Every number comes from the
Datum data platform through datum-api; this app holds no data and runs no crons. Without `DATUM_API_KEY` it runs
on labelled sample data.

- `datum.config.ts`: title, the question the overview answers, resources and their column mapping, nav, sources, definitions.
- `lib/data.ts`: turns resources into the normalised shapes in `lib/types.ts` (or returns `lib/sample.ts`).
- `lib/datum.ts`: the server-side platform client. `lib/format.ts`: the formatters every number goes through.
- `app/(app)/`: the shared frame (shadcn dashboard-01 block), the pages (overview, markets, one market, methodology, the chart guide) and a loading skeleton per route.
- `components/`: app-sidebar, site-header, command-menu, status-banner, page-header, page-breadcrumb, section-cards, chart-area-interactive, data-table, asset-avatar, market-charts, market-facts, market-detail-layout, site-footer, ThemeToggle; `components/charts/` is the chart library; `components/ui/` is shadcn on Phosphor icons.
- Design rules: `docs/DESIGN.md` in the kit; chart rules: `docs/CHARTS.md`.

```bash
npm install && npm run dev            # sample data
npm run dev:platform                   # the platform, key read from ~/.config/datum/.env
npm run check                          # typecheck, lint and build, before a PR
```

Deploy: `vercel link --scope datumlabs1 --project spark-dashboard-next`, add `DATUM_API_URL` and `DATUM_API_KEY`, push to main.
