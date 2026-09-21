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

test('the overview is open, the rest gates, and signing in holds', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog'), 'overview opens without a dialog').toHaveCount(0);
  const nav = await page.$$eval('[data-slot=sidebar-menu-button][href^="/"]', (as) => as.map((a) => a.getAttribute('href') as string).filter((h) => h !== '/'));
  if (!nav.length) return;
  // The server must never ship a page blurred or inert: a page that fails to hydrate stays readable,
  // and a signed-in reader is never asked again by HTML that was rendered before anyone signed in.
  for (const path of ['/', nav[0]]) {
    const html = await (await request.get(path)).text();
    expect(html, `${path} server HTML renders the page open`).not.toMatch(/data-slot="page"[^>]*(inert|blur)/);
    expect(html, `${path} server HTML carries no gate state`).not.toMatch(/data-gate-scope|data-gate=/);
  }
  // A gated page asks, and asks over a page that is present but inert.
  await page.goto(nav[0]);
  await expect(page.getByRole('dialog').getByRole('heading', { name: /Sign in to open the full dashboard/i })).toBeVisible();
  await expect(page.locator('main div[inert]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.dataset.gate), 'a locked reader on a gated page').toBe('locked');
  expect(await page.$eval('[data-slot=page]', (e) => getComputedStyle(e).filter), 'the page is blurred while locked').toContain('blur');
  // Sign in for real, without putting a test lead on the list.
  await page.route('**/api/gate', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.getByLabel('Full name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByLabel('What you do').selectOption('Analyst');
  await page.getByRole('button', { name: 'Open the dashboard' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // And it holds: through a link, a reload, a fresh load, and back to the overview.
  const open = async (where: string) => {
    await expect(page.getByRole('dialog'), `${where}: no dialog`).toHaveCount(0);
    await expect(page.locator('div[inert]'), `${where}: nothing inert`).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.dataset.gate), `${where}: flag`).toBe('open');
    expect(await page.$eval('[data-slot=page]', (e) => getComputedStyle(e).filter), `${where}: not blurred`).toBe('none');
  };
  await open('after signing in');
  await page.click(`[data-slot=sidebar-menu-button][href="${nav[nav.length - 1]}"]`);
  await open('after a link');
  await page.reload();
  await open('after a reload');
  await page.goto(nav[0]);
  await open('after a fresh load');
  await page.goto('/');
  await open('back on the overview');
});

test('phone width: no horizontal scroll on the overview', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
