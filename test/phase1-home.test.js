import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPages } from '../src/pages.mjs';
import { parseLead } from '../api/leads.js';

const html = buildPages().find(([file]) => file === 'index.html')[1];

test('homepage gives seller intake one hero job and links investor intake separately', () => {
  assert.match(html, /<h1>Sell Your Bakersfield House As-Is\. Get a Cash Offer &amp; Real Options\.<\/h1>/);
  assert.match(html, /No repairs, no cleaning, no pressure\. Nathanael Harbison/);
  assert.equal((html.match(/data-cta="hero"/g) || []).length, 1);
  assert.match(html, /sms:\+16614727499\?&amp;body=Hi%20Nathanael/);
  assert.doesNotMatch(html, /inquiry-card|I'm interested in investing/);
  assert.equal((html.match(/href="\/investors">Investors<\/a>/g) || []).length, 2);
  assert.match(html, /assets\/nathanael-harbison\.jpg/);
  assert.match(html, /Verify CA DRE #02059393/);
  assert.match(html, /Closed through licensed California title\/escrow/);
});

test('seller form captures address, situation, timeline, contact preference and response consent', () => {
  assert.match(html, /data-step="1"[\s\S]*?name="street"/);
  assert.match(html, /Your info stays private\. No spam\. No walkthrough required to start\./);
  for (const situation of ['Inherited / Probate', 'Needs Major Repairs', 'Tenant / Rental Issue', 'Need to Sell Fast', 'Other']) {
    assert.ok(html.includes(`name="situation" value="${situation}"`));
  }
  assert.match(html, /name="timeline"/);
  assert.match(html, /name="contact_pref" value="Text" checked/);
  assert.match(html, /name="consent_response" value="yes" required/);
  assert.match(html, /name="company" type="text" tabindex="-1" autocomplete="off"/);
  assert.doesNotMatch(html, /referral-source|name="heard_about_us"/);
  assert.match(html, /If a direct cash sale fits best, Call Harbison may act as the buyer/);
});

test('passive channel works without self-reported source and email preference requires an address', () => {
  const body = { form_type: 'options', address: '123 Example St, Bakersfield, CA 93301', name: 'Example Seller', phone: '6615550101', consent_response: 'yes', utm_source: 'google', utm_medium: 'cpc' };
  const parsed = parseLead(body);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.lead.channel, 'google_ads');
  assert.deepEqual(parseLead({ ...body, contact_pref: 'Email' }).errors, ['email']);
});
