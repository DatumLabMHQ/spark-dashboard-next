// The kit's generic smoke test, the same on every dashboard: every page in the sidebar renders signed in
// with no console errors and no number leaks, sections keep their gap, detail columns and card rows end on
// one line, and the first row of every table opens. It reads the navigation from the page, so a dashboard
// adds pages without touching it. Kit file: changed in the kit, copied forward by `datum sync`.
import { expect, test, type Page } from '@playwright/test';

const LEAKS = /\bNaN\b|\bundefined\b|\bInfinity\b|\$-|\[object Object\]/;
const SIGNED_IN = () => localStorage.setItem('datum_gate_unlocked', '1');

async function checkPage(page: Page, path: string) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  const res = await page.goto(path);
  expect(res?.status(), `${path} status`).toBe(200);
  await expect(page.getByRole('heading', { level: 1 }).first(), `${path} h1`).toBeVisible();
  await expect(page.getByRole('dialog'), `${path} gate stays closed when signed in`).toHaveCount(0);
  const text = await page.locator('main').innerText();
  expect(text, `${path} number leak`).not.toMatch(LEAKS);
  // Sections keep the layout's rhythm.
  const gaps = await page.$$eval('[data-slot=page] > *', (els) => { const r = els.map((e) => e.getBoundingClientRect()).filter((x) => x.height > 0); return r.slice(1).map((x, i) => Math.round(x.top - r[i].bottom)); });
  for (const g of gaps) expect(g, `${path} section gap`).toBeGreaterThanOrEqual(16);
  // Detail columns end on the same line.
  const panels = await page.$$eval('[data-slot=resizable-panel]', (ps) => ps.map((p) => Math.max(...Array.from(p.querySelectorAll('[data-slot=card]')).map((c) => c.getBoundingClientRect().bottom))));
  if (panels.length === 2) expect(Math.abs(panels[1] - panels[0]), `${path} column bottoms`).toBeLessThanOrEqual(4);
  // Cards that share a row end on the same line.
  const rows = await page.$$eval('[data-slot=card-row]', (rows) => rows.map((row) => { const b = Array.from(row.children).map((c) => c.getBoundingClientRect().bottom); return Math.max(...b) - Math.min(...b); }));
  for (const spread of rows) expect(spread, `${path} card-row bottoms`).toBeLessThanOrEqual(4);
  // Every chart or table card carries a description (the caption rule).
  const cards = page.locator('[data-slot=card]:has(svg.recharts-surface), [data-slot=card]:has(table)');
  for (let i = 0; i < await cards.count(); i++) await expect(cards.nth(i).locator('[data-slot=card-description]').first(), `${path} caption`).toHaveText(/.{20,}/);
  expect(errors, `${path} console errors`).toEqual([]);
}

test('every page in the sidebar renders clean, and the first row of each table opens', async ({ page }) => {
  await page.addInitScript(SIGNED_IN);
  await page.goto('/');
  const nav = await page.$$eval('[data-slot=sidebar-menu-button][href^="/"]', (as) => Array.from(new Set(as.map((a) => a.getAttribute('href') as string))));
  expect(nav.length, 'nav entries').toBeGreaterThanOrEqual(2);
  const seen = new Set<string>();
  for (const path of nav) {
    await checkPage(page, path);
    // The first table row that links somewhere is a detail page; check it once per path prefix.
    const href = await page.$eval('table tbody tr a[href^="/"]', (a) => a.getAttribute('href')).catch(() => null);
    if (href && !seen.has(href.split('/')[1])) { seen.add(href.split('/')[1]); await checkPage(page, href); }
  }
});

test('the overview is open and every other page sits behind the sign-in gate', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const nav = await page.$$eval('[data-slot=sidebar-menu-button][href^="/"]', (as) => as.map((a) => a.getAttribute('href') as string).filter((h) => h !== '/'));
  if (!nav.length) return;
  await page.goto(nav[0]);
  await expect(page.getByRole('dialog').getByRole('heading', { name: /Sign in to open the full dashboard/i })).toBeVisible();
  await expect(page.locator('main div[inert]')).toHaveCount(1);
});

test('phone width: no horizontal scroll on the overview', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
