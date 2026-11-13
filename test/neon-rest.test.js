import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../dev/test-database.mjs';
import { createRestHandler } from '../lib/neon-rest.js';

const BASE = 'https://neon.invalid/rest/v1/';
let db; let call;

before(async () => {
  db = await createTestDatabase();
  const handle = createRestHandler(async (text, params) => db.query(text, params));
  call = async (path, init = {}) => {
    const res = await handle(BASE + path, { ...init, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null };
  };
});

const lead = (over = {}) => ({ name: 'Test One', phone: '6615550101', address: '1 Test St, Bakersfield, CA 93301', situation: 'Other', ...over });

test('insert returns the stored row, with numbers and timestamps as JSON values', async () => {
  const { status, data } = await call('leads', { method: 'POST', prefer: undefined, headers: { Prefer: 'return=representation' }, body: lead({ offer_amount: 123456.5 }) });
  assert.equal(status, 201);
  assert.equal(data.length, 1);
  assert.equal(typeof data[0].offer_amount, 'number');
  assert.match(data[0].created_at, /^\d{4}-\d\d-\d\dT/);
  assert.ok(data[0].id);
});

test('ignore-duplicates keeps the first row and returns nothing for the repeat', async () => {
  const id = crypto.randomUUID();
  const headers = { Prefer: 'resolution=ignore-duplicates,return=representation' };
  const first = await call('leads?on_conflict=id', { method: 'POST', headers, body: lead({ id }) });
  const again = await call('leads?on_conflict=id', { method: 'POST', headers, body: lead({ id, name: 'Changed' }) });
  assert.equal(first.data.length, 1);
  assert.deepEqual(again.data, []);
  const row = await call(`leads?id=eq.${id}&select=name`);
  assert.equal(row.data[0].name, 'Test One');
});

test('a plain duplicate insert is reported as 409 with the Postgres code', async () => {
  const id = crypto.randomUUID();
  await call('leads', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: lead({ id }) });
  const dup = await call('leads', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: lead({ id }) });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.code, '23505');
});

test('merge-duplicates updates the existing row', async () => {
  const headers = { Prefer: 'resolution=merge-duplicates,return=representation' };
  await call('partners?on_conflict=slug', { method: 'POST', headers, body: { slug: 'neon-test', name: 'First', category: 'other', status: 'prospect' } });
  const merged = await call('partners?on_conflict=slug', { method: 'POST', headers, body: { slug: 'neon-test', name: 'Second', category: 'other', status: 'active' } });
  assert.equal(merged.data[0].name, 'Second');
  const all = await call('partners?slug=eq.neon-test');
  assert.equal(all.data.length, 1);
});

test('filters: eq, is.null, not.is.null, in, not.in, gte, ilike and or', async () => {
  const a = (await call('leads', { method: 'POST', headers: { Prefer: 'return=representation' }, body: lead({ name: 'Filter Alpha', phone: '6615550202', status: 'new' }) })).data[0];
  const b = (await call('leads', { method: 'POST', headers: { Prefer: 'return=representation' }, body: lead({ name: 'Filter Beta', phone: '6615550303', status: 'qualified', deleted_at: new Date().toISOString() }) })).data[0];
  const q = (s) => call(`leads?select=id&${s}`).then((r) => r.data.map((x) => x.id));
  assert.deepEqual(await q(`id=eq.${a.id}`), [a.id]);
  assert.ok((await q('deleted_at=is.null')).includes(a.id));
  assert.ok(!(await q('deleted_at=is.null')).includes(b.id));
  assert.deepEqual(await q(`id=eq.${b.id}&deleted_at=not.is.null`), [b.id]);
  assert.deepEqual((await q(`id=in.(${a.id},${b.id})&order=created_at.asc`)).sort(), [a.id, b.id].sort());
  assert.deepEqual(await q(`id=in.(${a.id},${b.id})&status=not.in.(qualified,closed_won)`), [a.id]);
  assert.deepEqual(await q(`id=eq.${a.id}&created_at=gte.2000-01-01T00:00:00Z`), [a.id]);
  assert.deepEqual(await q(`or=(name.ilike."*Filter Be*",phone.ilike."*0202*")&deleted_at=is.null`), [a.id]);
  assert.equal((await q(`or=(name.ilike."*Filter Be*",phone.ilike."*0202*")`)).length, 2);
});

test('order, limit and offset work, and select returns only the requested columns', async () => {
  const r = await call('leads?select=id,name&order=created_at.desc&limit=2&offset=1');
  assert.ok(r.data.length <= 2);
  for (const row of r.data) assert.deepEqual(Object.keys(row).sort(), ['id', 'name']);
});

test('PATCH updates only the given columns and returns the row when asked', async () => {
  const row = (await call('leads', { method: 'POST', headers: { Prefer: 'return=representation' }, body: lead({ name: 'Patch Me', notes: 'keep' }) })).data[0];
  const patched = await call(`leads?id=eq.${row.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { status: 'connected', next_followup: null } });
  assert.equal(patched.data[0].status, 'connected');
  assert.equal(patched.data[0].notes, 'keep');
  const none = await call(`leads?id=eq.${crypto.randomUUID()}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { status: 'new' } });
  assert.deepEqual(none.data, []);
});

test('DELETE removes only matching rows and can return them', async () => {
  const row = (await call('leads', { method: 'POST', headers: { Prefer: 'return=representation' }, body: lead({ name: 'Delete Me', deleted_at: new Date().toISOString() }) })).data[0];
  const keep = (await call('leads', { method: 'POST', headers: { Prefer: 'return=representation' }, body: lead({ name: 'Keep Me' }) })).data[0];
  const removed = await call(`leads?id=eq.${row.id}&deleted_at=not.is.null`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  assert.equal(removed.data.length, 1);
  assert.equal((await call(`leads?id=eq.${keep.id}`)).data.length, 1);
  assert.equal((await call(`leads?id=eq.${row.id}`)).data.length, 0);
});

test('views are readable like tables', async () => {
  const r = await call('v_partner_results?select=*&order=inquiries.desc');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data));
});

test('rpc functions are called with named arguments', async () => {
  const r = await call('rpc/lead_command_status', { method: 'POST', body: { request_id: crypto.randomUUID(), owner_hash: 'a'.repeat(64), fence: false } });
  assert.equal(r.status, 200);
  assert.ok(['unresolved', 'aborted', 'committed'].includes(r.data.state));
});

test('unsafe identifiers and unsupported filters are rejected, never run as SQL', async () => {
  assert.equal((await call('leads;drop table leads')).status, 400);
  assert.equal((await call('leads?select=id&id=eq.1;drop')).status >= 400, true);
  assert.equal((await call('leads?select=id&"x"=eq.1')).status, 400);
  assert.equal((await call('leads?select=id&name=badop.x')).status, 400);
  assert.equal((await call('leads', { method: 'POST', body: { 'name"; drop table leads; --': 'x' } })).status, 400);
  const still = await call('leads?select=id&limit=1');
  assert.equal(still.status, 200);
});
