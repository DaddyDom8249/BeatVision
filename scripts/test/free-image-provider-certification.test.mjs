import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGeneration } from './generation-runtime.mjs';

const verified = {
  beatvision_bridge: {
    image: {
      provider: 'cloudflare-workers-ai',
      execution_mode: 'cloudflare-only',
      verified_free: true,
      models: ['flux-schnell'],
    },
  },
};

async function check(body, status = 200) {
  const runtime = await loadGeneration({}, {
    ARENA_GATEWAY_URL: 'https://arena.internal.test',
    ARENA_GATEWAY_TOKEN: 'mock-server-only-token',
  });
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (resource, init) => {
    calls++;
    assert.equal(String(resource), 'https://arena.internal.test/health');
    assert.equal(init?.method, 'GET');
    assert.equal(init?.headers?.Authorization, 'Bearer mock-server-only-token');
    return Response.json(body, { status });
  };
  try {
    let error = null;
    try { await runtime.verifyFreeImageSource('test-image-job'); }
    catch (caught) { error = caught; }
    return { calls, error };
  } finally {
    globalThis.fetch = previousFetch;
    await runtime.cleanup();
  }
}

test('absence of verified free routing fails before any image submission', async () => {
  const result = await check({});
  assert.equal(result.calls, 1);
  assert.match(result.error?.message || '', /^PROVIDER_COST_UNVERIFIED/);
});

test('legacy Arena claiming free flux but Pixazo primary remains disallowed', async () => {
  const result = await check({ beatvision_bridge: {image:{ provider:'pixazo', models:['flux-schnell'], cost_class:'free' }} });
  assert.match(result.error?.message || '', /^PROVIDER_COST_UNVERIFIED/);
});

test('paid/unknown provider added to a free allowlist is rejected', async () => {
  const result = await check({beatvision_bridge:{image:{...verified.beatvision_bridge.image,models:['flux-schnell','sd3.5']}}});
  assert.match(result.error?.message || '', /^PROVIDER_COST_UNVERIFIED/);
});

test('failed authenticated health request fails closed', async () => {
  const result = await check(verified,503);
  assert.match(result.error?.message || '', /^PROVIDER_COST_UNVERIFIED/);
});

test('certified Cloudflare-only Workers Free capability permits image dispatch', async () => {
  const result = await check(verified);
  assert.equal(result.calls, 1);
  assert.equal(result.error, null);
});
