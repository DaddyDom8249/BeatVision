import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGeneration } from './generation-runtime.mjs';

for (const [name, data, type, expected] of [
  ['nested Shotstack done completes', { ok: true, result: { status: 'done', video_url: 'https://example.test/final.mp4' } }, 'assembly', 'completed'],
  ['nested Shotstack failure fails', { ok: true, result: { status: 'failed' } }, 'assembly', 'failed'],
  ['nested Shotstack rendering remains pending', { ok: true, result: { status: 'rendering' } }, 'assembly', 'processing'],
  ['nested unknown state is not successful even with media', { ok: true, result: { status: 'unexpected', video_url: 'https://example.test/final.mp4' } }, 'assembly', 'processing'],
  ['top-level failure wins over nested completion', { status: 'failed', result: { status: 'done' } }, 'assembly', 'failed'],
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
    for (const origin of [
      'https://beat-vision-theta.vercel.app',
      'https://beat-vision-beat-vision.vercel.app',
      'https://beat-vision-git-fix-style-description-genera-790bfa-beat-vision.vercel.app',
      'https://beat-vision-f8nn-git-fix-style-description-g-a4cacb-beat-vision.vercel.app',
    ]) {
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
  const client = { from: name => name === 'scene_image_assets' ? imageQuery : { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null }), insert(row) { saved = row; return { select: () => ({ single: async () => ({ data: row }) }) }; } } };
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
  const client = { from() { return {
    update(data) { failedState = data; return this; },
    eq() { return this; },
    select() { return this; },
    async maybeSingle() { return { data: { id: 'job-1', ...failedState } }; },
  }; } };
  const runtime = await loadGeneration();
  try {
    const result = await runtime.poll(client, { id: 'job-1', status: 'processing', job_type: 'scene_motion', output: {} });
    assert.equal(result.status, 'failed');
    assert.equal(result.error.code, 'ARENA_GENERATION_FAILED');
    assert.match(result.error.message, /without a provider job id/);
  } finally { await runtime.cleanup(); }
});

test('persistFinalVideo scopes final videos to generation_job_id and prevents duplicate creation', async () => {
  const dbRows = [];
  const client = {
    from(table) {
      assert.equal(table, 'final_videos');
      let queryJobId = null;
      return {
        select() { return this; },
        eq(key, val) {
          if (key === 'generation_job_id') queryJobId = val;
          return this;
        },
        maybeSingle: async () => {
          const match = dbRows.find(r => r.generation_job_id === queryJobId);
          return { data: match || null, error: null };
        },
        upsert(row, opts) {
          assert.equal(opts?.onConflict, 'generation_job_id');
          let match = dbRows.find(r => r.generation_job_id === row.generation_job_id);
          if (!match) {
            match = { id: 'vid-' + (dbRows.length + 1), ...row };
            dbRows.push(match);
          } else {
            Object.assign(match, row);
          }
          return {
            select() {
              return { single: async () => ({ data: match, error: null }) };
            }
          };
        }
      };
    }
  };

  const runtime = await loadGeneration();
  try {
    const job1 = { id: 'assembly-job-1', job_type: 'assembly', project_id: 'proj-1', input_snapshot: { plan: { title: 'Plan A' } } };
    const res1 = await runtime.persistFinalVideo(client, job1, { video_url: 'https://example.test/plan_a.mp4' });

    const job2 = { id: 'assembly-job-2', job_type: 'assembly', project_id: 'proj-1', input_snapshot: { plan: { title: 'Plan B' } } };
    const res2 = await runtime.persistFinalVideo(client, job2, { video_url: 'https://example.test/plan_b.mp4' });

    assert.notEqual(res1.id, res2.id);
    assert.equal(res1.generation_job_id, 'assembly-job-1');
    assert.equal(res2.generation_job_id, 'assembly-job-2');
    assert.equal(dbRows.length, 2);

    // Re-persisting job2 reuses res2 by generation_job_id without creating a duplicate row
    const res2Retry = await runtime.persistFinalVideo(client, job2, { video_url: 'https://example.test/plan_b.mp4' });
    assert.equal(res2Retry.id, res2.id);
    assert.equal(dbRows.length, 2);
  } finally {
    await runtime.cleanup();
  }
});

test('duplicate completion attempts reuse existing completed assets and return without duplication', async () => {
  let insertCount = 0;
  const client = {
    from(table) {
      if (table === 'scene_image_assets') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: { id: 'existing-asset-1', image_url: 'https://example.test/existing.jpg' } })
                };
              }
            };
          },
          insert() {
            insertCount++;
            return { select: () => ({ single: async () => ({ data: {} }) }) };
          }
        };
      }
      return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null }) };
    }
  };

  const runtime = await loadGeneration();
  try {
    const asset = await runtime.persistSceneImage(client, { id: 'job-dup-1', job_type: 'scene_image' }, { image_url: 'https://example.test/new.jpg' });
    assert.equal(asset.id, 'existing-asset-1');
    assert.equal(insertCount, 0);
  } finally {
    await runtime.cleanup();
  }
});

test('0-row update race condition is detected and fails safely', async () => {
  const client = {
    from() {
      return {
        update() {
          return {
            eq() {
              return {
                in() {
                  return {
                    select() {
                      return { error: null, data: [] }; // 0 rows updated
                    }
                  };
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
        await runtime.setFailed(client, 'job-race-1', 'Test race condition');
      },
      /SET_FAILED_ZERO_ROWS_AFFECTED/
    );
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
                  return {
                    select() {
                      return { error: { message: 'Database constraint failure on update' } };
                    }
                  };
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
          return {
            eq() {
              return {
                in() {
                  return {
                    select() { return { error: null, data: [{ id: 'job-img-1' }] }; }
                  };
                }
              };
            }
          };
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
