import test from 'node:test';
import assert from 'node:assert/strict';
import track from '../api/track.js';
import hq, { makeSession } from '../api/hq.js';

const env = { CRM_INGEST_SECRET: 'test-secret-at-least-thirty-two-characters', HQ_PASSWORD: 'test', SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test' };
const response = () => ({ statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(c) { this.statusCode=c; return this; }, json(b) { this.body=b; return this; } });
test('collector labels its own site, strips query strings and never forwards raw IP', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://www.harbisonstandard.com/api/track');
    const payload = JSON.parse(init.body);
    assert.equal(payload.site, 'call_harbison');
    assert.equal(payload.path, '/contact');
    assert.match(init.headers['x-analytics-visitor'], /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(init).includes('192.0.2.8'), false);
    return Response.json({ ok: true, stored: true });
  };
  try {
    const res=response();
    await track({ method:'POST', headers:{'x-forwarded-for':'192.0.2.8'}, body:{sid:crypto.randomUUID(),type:'start',path:'/contact?email=private',site:'harbison_standard'} },res,env);
    assert.equal(res.body.stored,true);
  } finally { globalThis.fetch=original; }
});
test('collector excludes HQ pages, unsupported events and privacy opt-outs', async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async()=>assert.fail('No upstream request expected');
  try {
    for (const [path,type,headers,status] of [['/hq','start',{},400],['/contact','invented',{},400],['/contact','start',{'sec-gpc':'1'},202]]) {
      const res=response();
      await track({method:'POST',headers,body:{sid:crypto.randomUUID(),path,type}},res,env);
      assert.equal(res.statusCode,status);
    }
  } finally {globalThis.fetch=original;}
});
test('HQ forwards only the selected known site and rejects unknown sites', async () => {
  const original=globalThis.fetch;
  const headers={cookie:`hq_session=${makeSession('test',env)}`};
  globalThis.fetch=async(url)=>{
    assert.equal(url,'https://www.harbisonstandard.com/api/hq/analytics?days=7&site=call_harbison');
    return Response.json({site:'call_harbison',totals:{sessions:0},daily:[]});
  };
  try {
    const res=response(); await hq({method:'GET',url:'/api/hq?action=analytics&days=7&site=call_harbison',headers},res,env);
    assert.equal(res.body.site,'call_harbison');
    const bad=response(); await hq({method:'GET',url:'/api/hq?action=analytics&site=unknown',headers},bad,env);
    assert.equal(bad.statusCode,400);
  } finally {globalThis.fetch=original;}
});
