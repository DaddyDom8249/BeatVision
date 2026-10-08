import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGeneration } from './generation-runtime.mjs';

for (const [name, data, type, expected] of [
  ['unknown states remain processing', { status: 'unexpected' }, 'scene_motion', 'processing'],
  ['explicit success completes', { status: 'completed' }, 'scene_motion', 'completed'],
  ['synchronous image URL completes', { image_url: 'https://example.test/image.jpg' }, 'scene_image', 'completed'],
  ['synchronous base64 image completes', { result: { images: [{ image_base64: 'aW1hZ2U=' }] } }, 'scene_image', 'completed'],
  ['failure wins over an attached image', { status: 'failed', image_url: 'https://example.test/image.jpg' }, 'scene_image', 'failed'],
  ['ok false is a failure', { ok: false, status: 'completed' }, 'scene_motion', 'failed'],
]) test(name, async () => {
  const runtime = await loadGeneration();
  try { assert.equal(runtime.terminalState(new Response('{}'), data, type), expected); }
  finally { await runtime.cleanup(); }
});

test('browser preflight succeeds for production and does not permit arbitrary origins', async () => {
  const runtime = await loadGeneration();
  try {
    for (const origin of ['https://beat-vision-theta.vercel.app', 'https://beat-vision-beat-vision.vercel.app']) {
      const response = await runtime.handler(new Request('https://test/function', { method: 'OPTIONS', headers: { Origin: origin } }));
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
      assert.match(response.headers.get('Access-Control-Allow-Headers'), /authorization/);
    }
    const response = await runtime.handler(new Request('https://test/function', { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } }));
    assert.notEqual(response.headers.get('Access-Control-Allow-Origin'), 'https://evil.test');
  } finally { await runtime.cleanup(); }
});

test('auth errors retain CORS without accepting unauthenticated requests', async () => {
  const runtime = await loadGeneration();
  try {
    const response = await runtime.handler(new Request('https://test/function', { method: 'POST', headers: { Origin: 'https://beat-vision-theta.vercel.app' } }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://beat-vision-theta.vercel.app');
  } finally { await runtime.cleanup(); }
});

test('motion persistence records the actual fallback provider and model', async () => {
  let saved;
  const imageQuery = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, async maybeSingle() { return { data: { id: 'image-1' } }; } };
  const client = { from: name => name === 'scene_image_assets' ? imageQuery : { upsert(row) { saved = row; return { select: () => ({ single: async () => ({ data: row }) }) }; } } };
  const runtime = await loadGeneration();
  try {
    await runtime.persistMotionClip(client, { id: 'job-1', job_type: 'scene_motion', project_id: 'project-1', visual_plan_id: 'plan-1', visual_plan_scene_id: 'scene-1' }, { status: 'completed', provider: 'shotstack', model: 'image-motion', result: { video_url: 'https://example.test/clip.mp4', generation_type: 'PROCEDURAL_MOTION' } });
    assert.equal(saved.provider, 'shotstack');
    assert.equal(saved.model, 'image-motion');
    assert.equal(saved.approved, false);
  } finally { await runtime.cleanup(); }
});

for (const [name, owner, assetProject, expected] of [
  ['owner can refresh own image', 'user-1', 'project-1', 200],
  ['non-owner cannot refresh another project image', 'other-user', 'project-1', 404],
  ['asset from another project cannot be refreshed', 'user-1', 'other-project', 404],
]) test(name, async () => {
  let signed = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(table) {
      const filters = {};
      return { select() { return this; }, eq(k,v) { filters[k] = v; return this; }, async maybeSingle() {
        return { data: table === 'projects' ? { id: 'project-1', owner_id: owner }
          : filters.project_id === assetProject ? { id: 'asset-1', storage_path: 'project-1/scene-images/test.jpg' } : null };
      } };
    },
    storage: { from: () => ({ createSignedUrl: async () => { signed++; return { data: { signedUrl: 'https://fresh.test/image.jpg' } }; } }) },
  };
  const runtime = await loadGeneration(client);
  try {
    const response = await runtime.handler(new Request('https://test/function', {
      method: 'POST', headers: { Authorization: 'Bearer test-session', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'image_url', projectId: 'project-1', assetId: 'asset-1' }),
    }));
    assert.equal(response.status, expected);
    assert.equal(signed, expected === 200 ? 1 : 0);
  } finally { await runtime.cleanup(); }
});

test('poll fails processing job cleanly when upstream_job_id is missing', async () => {
  let failedState = null;
  const client = {
    from(table) {
      return {
        update(data) {
          failedState = data;
          return { eq() { return { in() { return { error: null }; } }; } };
        },
        select() {
          return {
            eq() {
              return { single: async () => ({ data: { id: 'job-1', status: 'failed', error: failedState?.error } }) };
            }
          };
        }
      };
    }
  };

  const runtime = await loadGeneration();
  try {
    const job = { id: 'job-1', status: 'processing', job_type: 'scene_motion', output: {} };
    const result = await runtime.poll(client, job);
    assert.equal(result.status, 'failed');
    assert.equal(result.error.code, 'ARENA_GENERATION_FAILED');
    assert.match(result.error.message, /without a provider job id/);
  } finally {
    await runtime.cleanup();
  }
});

test('setFailed throws or surfaces error when database update fails', async () => {
  const client = {
    from() {
      return {
        update() {
          return {
            eq() {
              return {
                in() {
                  return { error: { message: 'Database constraint failure on update' } };
                }
              };
            }
          };
        }
      };
    }
  };

  const runtime = await loadGeneration();
  try {
    await assert.rejects(
      async () => {
        await runtime.setFailed(client, 'job-1', 'Test failure message');
      },
      /Database constraint failure on update/
    );
  } finally {
    await runtime.cleanup();
  }
});

test('poll fails processing scene_image job cleanly', async () => {
  let failedState = null;
  const client = {
    from() {
      return {
        update(data) {
          failedState = data;
          return { eq() { return { in() { return { error: null }; } }; } };
        },
        select() {
          return {
            eq() {
              return { single: async () => ({ data: { id: 'job-img-1', status: 'failed', error: failedState?.error } }) };
            }
          };
        }
      };
    }
  };

  const runtime = await loadGeneration();
  try {
    const job = { id: 'job-img-1', status: 'processing', job_type: 'scene_image', output: { upstream_job_id: 'up-1' } };
    const result = await runtime.poll(client, job);
    assert.equal(result.status, 'failed');
    assert.equal(result.error.code, 'ARENA_GENERATION_FAILED');
    assert.match(result.error.message, /scene_image/i);
  } finally {
    await runtime.cleanup();
  }
});
