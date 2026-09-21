// The sign-in gate's sink. With BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID set, the lead goes straight
// onto the Datum Labs list (name and occupation as custom fields, the dashboard as utm_source), the
// same way datumlab.xyz's report gate does. Without them it forwards to the site's own gate route
// (GATE_FORWARD_URL), so every dashboard feeds one list with no extra keys.
import { NextResponse } from 'next/server';
import { config } from '@/datum.config';

export const dynamic = 'force-dynamic';
const FORWARD = process.env.GATE_FORWARD_URL || 'https://www.datumlab.xyz/api/gate';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const name = String(body.name ?? '').trim(), email = String(body.email ?? '').trim(), occupation = String(body.occupation ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Your name is required' }, { status: 400 });
  if (!EMAIL.test(email)) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  if (!occupation) return NextResponse.json({ error: 'What you do is required' }, { status: 400 });
  const source = `dashboard-${config.slug}`.replace(/[^a-z0-9-]/gi, '-').slice(0, 40);

  const publicationId = process.env.BEEHIIV_PUBLICATION_ID, apiKey = process.env.BEEHIIV_API_KEY;
  try {
    if (publicationId && apiKey) {
      const url = `https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions`;
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` };
      const base = { email, reactivate_existing: true, send_welcome_email: false, utm_source: source };
      let res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...base, custom_fields: [{ name: 'Name', value: name }, { name: 'Occupation', value: occupation }] }) });
      if (!res.ok) {
        console.error('gate: Beehiiv rejected custom fields', await res.json().catch(() => ({})));
        res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(base) });
        if (!res.ok) { console.error('gate: Beehiiv rejected email-only', await res.json().catch(() => ({}))); return NextResponse.json({ error: 'Could not sign you in; try again' }, { status: 502 }); }
      }
      return NextResponse.json({ ok: true });
    }
    const res = await fetch(FORWARD, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email, occupation, source }) });
    if (!res.ok) { console.error('gate: forward failed', res.status, await res.text().catch(() => '')); return NextResponse.json({ error: 'Could not sign you in; try again' }, { status: 502 }); }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('gate:', e);
    return NextResponse.json({ error: 'Could not sign you in; try again' }, { status: 500 });
  }
}
