import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGeneration } from './generation-runtime.mjs';

const HOST = 'beatvision-provider-arena.creator.workers.dev';
const env = { ARENA_GATEWAY_URL: 'https://' + HOST,
  ARENA_GATEWAY_ALLOWED_HOSTS: HOST, ARENA_GATEWAY_TOKEN: 'fixture-secret-not-real' };
const cases = [
  ['missing host allowlist', { ARENA_GATEWAY_ALLOWED_HOSTS: '' }],
  ['wildcard host', { ARENA_GATEWAY_ALLOWED_HOSTS: '*.workers.dev' }],
  ['other host', { ARENA_GATEWAY_URL: 'https://imposter.creator.workers.dev' }],
  ['suffix spoof', { ARENA_GATEWAY_URL: 'https://' + HOST + '.evil.com' }],
  ['wrong scheme', { ARENA_GATEWAY_URL: 'http://' + HOST }],
  ['userinfo', { ARENA_GATEWAY_URL: 'https://user:password@' + HOST }],
  ['nonstandard port', { ARENA_GATEWAY_URL: 'https://' + HOST + ':8443' }],
  ['path segment', { ARENA_GATEWAY_URL: 'https://' + HOST + '/gateway' }],
  ['URL query', { ARENA_GATEWAY_URL: 'https://' + HOST + '/?secret=1' }],
  ['URL fragment', { ARENA_GATEWAY_URL: 'https://' + HOST + '/#secret' }],
  ['IPv4 metadata host', { ARENA_GATEWAY_URL: 'https://169.254.169.254', ARENA_GATEWAY_ALLOWED_HOSTS: '169.254.169.254' }],
  ['IPv6 loopback host', { ARENA_GATEWAY_URL: 'https://[::1]', ARENA_GATEWAY_ALLOWED_HOSTS: '[::1]' }],
  ['local DNS host', { ARENA_GATEWAY_URL: 'https://metadata.internal', ARENA_GATEWAY_ALLOWED_HOSTS: 'metadata.internal' }],
];
for (const [name, overrides] of cases) {
  test('Arena gateway rejects ' + name + ' before making a request', async () => {
    const runtime = await loadGeneration({}, { ...env, ...overrides });
    const oldFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = async () => { called = true; throw Error('NETWORK_SHOULD_NOT_BE_CALLED'); };
    try {
      assert.throws(() => runtime.arenaBase(), /ARENA_GATEWAY_/);
      await assert.rejects(runtime.arena('/v2/scene-image', 'POST', {}, 'fixture-id'), /ARENA_GATEWAY_/);
      assert.equal(called, false);
    } finally { globalThis.fetch = oldFetch; await runtime.cleanup(); }
  });
}

test('Arena accepts only a pinned HTTPS v2 origin with bearer token, redirect and timeout protection', async () => {
  const runtime = await loadGeneration({}, env);
  const original = globalThis.fetch; let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ ok: true, result: { status: 'completed' } }),
      { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    assert.equal(runtime.arenaBase(), 'https://' + HOST);
    const result = await runtime.arena('/v2/scene-image', 'POST', {test:true}, 'id-1');
    assert.equal(result.response.ok, true);
    assert.equal(result.data.ok, true);
    assert.equal(captured.url, 'https://' + HOST + '/v2/scene-image');
    assert.equal(captured.init.headers.Authorization, 'Bearer fixture-secret-not-real');
    assert.equal(captured.init.redirect, 'error');
    assert.equal(captured.init.credentials, undefined);
    assert.equal(captured.init.signal instanceof AbortSignal, true);
    assert.deepEqual(JSON.parse(captured.init.body), { payload: {test:true} });
  } finally { globalThis.fetch=original; await runtime.cleanup(); }
});

for (const path of ['//metadata.internal/v2/x', '/v2/../private',
  '/v2/scene-image?token=secret', '/v2/scene-image#secret',
  '/v2/x%2f..%2fprivate', '/v1/animate']) {
  test('Arena rejects unapproved path ' + path, async () => {
    const runtime = await loadGeneration({},env);
    const original = globalThis.fetch; let called=false;
    globalThis.fetch=async()=>{called=true;throw Error('unexpected call')};
    try {
      await assert.rejects(runtime.arena(path, 'GET', null, 'id-1'), /ARENA_GATEWAY_PATH_REJECTED/);
      assert.equal(called,false);
    } finally { globalThis.fetch=original; await runtime.cleanup(); }
  });
}

test('Arena refuses oversized Content-Length prior to reading response', async () => {
  const runtime = await loadGeneration({},env);
  const original = globalThis.fetch;
  globalThis.fetch=async()=>new Response('x', {headers: {'content-length': String(20*1024*1024)}});
  try {await assert.rejects(runtime.arena('/v2/scene-image','GET',null,'id-1'),/ARENA_GATEWAY_RESPONSE_TOO_LARGE/);}
  finally {globalThis.fetch=original; await runtime.cleanup();}
});

test('Arena stops streamed oversized JSON without unbounded memory use', async () => {
  const runtime = await loadGeneration({},env);
  const original = globalThis.fetch;
  const chunk=new Uint8Array(9*1024*1024);
  globalThis.fetch=async()=>new Response(new ReadableStream({
    start(controller) {controller.enqueue(chunk);controller.enqueue(chunk);controller.close();}
  }));
  try {await assert.rejects(runtime.arena('/v2/scene-image','GET',null,'id-1'),/ARENA_GATEWAY_RESPONSE_TOO_LARGE/);}
  finally {globalThis.fetch=original; await runtime.cleanup();}
});

test('Arena refuses redirected bearer requests', async () => {
  const runtime=await loadGeneration({},env), original=globalThis.fetch;
  globalThis.fetch=async (_url,init)=>{
    assert.equal(init.redirect,'error');
    throw new TypeError('fetch redirect disallowed');
  };
  try {await assert.rejects(runtime.arena('/v2/scene-image','POST',{},'id-1'),/redirect disallowed/);}
  finally {globalThis.fetch=original; await runtime.cleanup();}
});

for (const [path, method] of [
  ['/v1/video/animate/jobs/render-123', 'GET'],
  ['/v1/video/assemble/status/render-123', 'POST'],
]) test('Arena permits pinned legacy polling route ' + path, async () => {
  const runtime=await loadGeneration({},env), oldFetch=globalThis.fetch;
  let called=0;
  globalThis.fetch=async(url,options)=>{
    called++;
    assert.equal(String(url),'https://'+HOST+path);
    assert.equal(options.method,method);
    assert.equal(options.redirect,'error');
    return Response.json({status:'processing'});
  };
  try {
    const response=await runtime.arena(path,method,null,'fixture-poll');
    assert.equal(called,1);
    assert.equal(response.data.status,'processing');
  } finally {globalThis.fetch=oldFetch;await runtime.cleanup();}
});

for (const [path,method] of [
  ['/v1/video/animate/jobs/render-123','POST'],
  ['/v1/video/assemble/status/render-123','GET'],
  ['/v1/video/animate/jobs/../secrets','GET'],
  ['/v1/video/animate/jobs/encoded%2fslash','GET'],
  ['/v1/video/animate/jobs/%252e%252e','GET'],
]) test('Arena rejects wrong polling method or untrusted ID '+path+' '+method,async()=>{
  const runtime=await loadGeneration({},env), oldFetch=globalThis.fetch;
  let called=0;globalThis.fetch=async()=>{called++;throw Error('forbidden-network')};
  try {
    await assert.rejects(runtime.arena(path,method,null,'fixture'),/ARENA_GATEWAY_PATH_REJECTED/);
    assert.equal(called,0);
  } finally {globalThis.fetch=oldFetch;await runtime.cleanup();}
});
