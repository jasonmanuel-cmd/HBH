import { test } from 'node:test';
import assert from 'node:assert/strict';
import hqHandler, { makeSession } from '../api/hq.js';
import { db, installMockSupabase } from '../dev/mock-supabase.mjs';

function callApi(req, env) {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  res.end = () => res;
  return Promise.resolve(hqHandler({ headers: {}, ...req }, res, env)).then(() => res);
}

const env = { HQ_PASSWORD: 'test-password-123' };
installMockSupabase(env);
const cookie = `hq_session=${makeSession('Nate', env)}`;
const read = { cookie };
const write = { cookie, 'x-hq': '1' };
const listIds = async (view) => (await callApi({ method: 'GET', url: `/api/hq?action=leads&view=${view}&limit=200`, headers: read }, env)).body.leads.map((l) => l.id);

test('Delete moves a lead to Trash: hidden from lists and dashboard counts, shown in Trash', async () => {
  const lead = db.leads.find((l) => l.status === 'new');
  const before = (await callApi({ method: 'GET', url: '/api/hq?action=stats', headers: read }, env)).body.stats;

  const res = await callApi({ method: 'DELETE', url: `/api/hq?action=lead&id=${lead.id}`, headers: write }, env);
  assert.equal(res.statusCode, 200);
  assert.ok(lead.deleted_at, 'deleted_at is set');
  assert.equal(lead.deleted_by, 'Nate');

  assert.ok(!(await listIds('all')).includes(lead.id), 'not in All');
  assert.ok(!(await listIds('open')).includes(lead.id), 'not in Open');
  assert.ok((await listIds('trash')).includes(lead.id), 'in Trash');

  const after = (await callApi({ method: 'GET', url: '/api/hq?action=stats', headers: read }, env)).body.stats;
  assert.equal(after.openPipeline, before.openPipeline - 1, 'dashboard no longer counts it');

  const detail = await callApi({ method: 'GET', url: `/api/hq?action=lead&id=${lead.id}`, headers: read }, env);
  assert.ok(detail.body.lead.deleted_at, 'detail view knows it is in Trash');
  assert.ok(detail.body.events.some((e) => /trash/i.test(e.detail) && e.actor === 'Nate'), 'activity log records who deleted it');
});

test('Restore brings a trashed lead back', async () => {
  const lead = db.leads.find((l) => l.deleted_at);
  const res = await callApi({ method: 'POST', url: `/api/hq?action=restore&id=${lead.id}`, headers: write }, env);
  assert.equal(res.statusCode, 200);
  assert.equal(lead.deleted_at, null);
  assert.ok((await listIds('all')).includes(lead.id));
  assert.ok(!(await listIds('trash')).includes(lead.id));
});

test('Delete forever only works from Trash and needs the typed confirmation', async () => {
  const lead = db.leads.find((l) => !l.deleted_at);
  const notTrashed = await callApi({ method: 'DELETE', url: `/api/hq?action=purge&id=${lead.id}`, headers: write, body: { confirm: 'DELETE' } }, env);
  assert.equal(notTrashed.statusCode, 409, 'refuses a lead that is not in Trash');
  assert.ok(db.leads.includes(lead));

  await callApi({ method: 'DELETE', url: `/api/hq?action=lead&id=${lead.id}`, headers: write }, env);
  const noConfirm = await callApi({ method: 'DELETE', url: `/api/hq?action=purge&id=${lead.id}`, headers: write, body: {} }, env);
  assert.equal(noConfirm.statusCode, 400, 'requires confirm: "DELETE"');
  assert.ok(db.leads.includes(lead));

  const ok = await callApi({ method: 'DELETE', url: `/api/hq?action=purge&id=${lead.id}`, headers: write, body: { confirm: 'DELETE' } }, env);
  assert.equal(ok.statusCode, 200);
  assert.ok(!db.leads.some((l) => l.id === lead.id), 'row is gone');
});

test('Trash actions require a session, the HQ header, and a valid id', async () => {
  const id = db.leads[0].id;
  assert.equal((await callApi({ method: 'DELETE', url: `/api/hq?action=lead&id=${id}`, headers: {} }, env)).statusCode, 401);
  assert.equal((await callApi({ method: 'DELETE', url: `/api/hq?action=lead&id=${id}`, headers: read }, env)).statusCode, 403);
  assert.equal((await callApi({ method: 'DELETE', url: '/api/hq?action=lead&id=not-a-uuid', headers: write }, env)).statusCode, 400);
  assert.equal((await callApi({ method: 'POST', url: '/api/hq?action=restore&id=not-a-uuid', headers: write }, env)).statusCode, 400);
});
