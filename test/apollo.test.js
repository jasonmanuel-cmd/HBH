import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import hq, { makeSession } from '../api/hq.js';
import apollo from '../api/apollo.js';
import { approvedDestination, walkthroughId, apolloStore } from '../lib/apollo.js';

const env = { HQ_PASSWORD: 'test', SUPABASE_URL: 'https://x.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test', APOLLO_APPROVED_URLS: 'https://www.callharbison.com/contact' };
const host = 'www.callharbison.com';
function response() {
  const r = { statusCode: 200, headers: {} };
  r.status = c => (r.statusCode = c, r);
  r.setHeader = (k,v) => { r.headers[k]=v; };
  r.json = r.end = v => { r.body=v; };
  return r;
}
test('Apollo only accepts approved HTTPS URLs or canonical YouTube videos', () => {
  assert.equal(approvedDestination('https://www.callharbison.com/contact',env), 'https://www.callharbison.com/contact');
  assert.equal(approvedDestination('https://youtu.be/dQw4w9WgXcQ',env), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  for (const url of ['https://callharbison.com/go/apollo','https://www.callharbison.com/go/apollo.html','https://www.callharbison.com/hq','https://example.test/','http://www.callharbison.com/contact','https://youtu.be/ws','https://www.youtube.com/redirect','https://www.youtube.com@elsewhere.test/watch?v=dQw4w9WgXcQ','https://www.youtube.com/watch?v=dQw4w9WgXcQ&next=https://evil.test','//www.callharbison.com/contact']) assert.equal(approvedDestination(url,env),null,url);
  assert.equal(walkthroughId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(walkthroughId('javascript:alert(1)'),null);
});
test('HQ write, durable Apollo revision, public QR redirect, reset and conflict', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('../migrations/apollo.sql',import.meta.url),'utf8'));
    const store = apolloStore(async (q,p) => (await db.query(q,p)).rows);
    const cookie = 'hq_session='+makeSession('Billy test',env);
    async function command(method,body,headers={host,cookie,'x-hq':'1',origin:'https://'+host,'content-type':'application/json'}) {
      const r=response();
      await hq({url:'/api/hq?action=apollo',method,headers,body},r,env,undefined,store);
      return r;
    }
    async function scan(method='GET', override=store, hostname=host) {
      const r=response(); await apollo({method,headers:{host:hostname}},r,env,override); return r;
    }
    const original=await scan();
    assert.equal(original.statusCode,200);
    assert.equal(original.body, await readFile(new URL('../content/apollo.html',import.meta.url),'utf8'));
    assert.equal(original.headers['Cache-Control'],'no-store');
    assert.equal((await scan('HEAD')).body,undefined);
    assert.equal((await scan('POST')).statusCode,405);
    assert.equal((await scan('GET',store,'www.harbisonstandard.com')).statusCode,404);
    const body = {revision:0,destination:'https://www.callharbison.com/contact',video:''};
    assert.equal((await command('GET',undefined,{host})).statusCode,401);
    for (const headers of [{host,cookie,origin:'https://'+host},{host,cookie,'x-hq':'1',origin:'https://other.test'},{host:'www.harbisonstandard.com',cookie,'x-hq':'1'}]) assert.equal((await command('PATCH',body,headers)).statusCode,403);
    for (const bad of [{...body,destination:'https://evil.test/'},{...body,project:'another'},{...body,video:'<script>'}]) assert.equal((await command('PATCH',bad)).statusCode,400);
    assert.equal((await command('GET')).body.state.revision,0);
    const writes = await Promise.all([command('PATCH',body),command('PATCH',body)]);
    assert.deepEqual(writes.map(x=>x.statusCode).sort(),[200,409]);
    const redirect=await scan(); assert.equal(redirect.statusCode,307);
    assert.equal(redirect.headers.Location,body.destination);
    assert.equal(redirect.headers['Cache-Control'],'no-store');
    const updated=await command('PATCH',{revision:1,destination:'',video:'https://youtu.be/dQw4w9WgXcQ'});
    assert.equal(updated.body.state.revision,2);
    const landing=await scan();
    assert.equal(landing.statusCode,200);
    assert.match(landing.body,/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
    const reset=await command('PATCH',{revision:2,destination:'',video:''});
    assert.equal(reset.statusCode,200);
    assert.equal((await scan()).body,original.body);
    assert.equal((await scan('GET',{read:()=>Promise.reject(Error('unavailable'))})).body,original.body);
    const revisions=await db.query('select revision, actor_label from apollo.revisions order by revision');
    assert.deepEqual(revisions.rows,[1,2,3].map(revision=>({revision,actor_label:'Billy test'})));
  } finally { await db.close(); }
});
