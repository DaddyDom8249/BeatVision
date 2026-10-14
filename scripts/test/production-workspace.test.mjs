import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const dir = await mkdtemp(join(rootDir, '.ui-test-'));
const source = await readFile(new URL('../../src/pages/ProductionWorkspacePage.tsx', import.meta.url), 'utf8');
const transpile = (code) => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const readSrc = (path) => readFile(new URL('../../' + path, import.meta.url), 'utf8');
await writeFile(join(dir, 'model-catalog.mjs'), transpile(await readSrc('supabase/functions/_shared/model-catalog.ts')));
await writeFile(join(dir, 'models.mjs'), transpile((await readSrc('src/lib/generation/models.ts')).replace('"../../../supabase/functions/_shared/model-catalog"', '"./model-catalog.mjs"')));
await writeFile(join(dir, 'ModelCostGate.mjs'), transpile((await readSrc('src/components/generation/ModelCostGate.tsx')).replaceAll('"../../lib/generation/models"', '"./models.mjs"')));
const transformed = ts.transpileModule(source.replace('"../lib/supabase/client"', '"./stub.mjs"').replace('"../lib/formatCreativeText"', '"./formatCreativeText.mjs"').replace('"../components/generation/ModelCostGate"', '"./ModelCostGate.mjs"').replace('"../lib/generation/models"', '"./models.mjs"'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
await writeFile(join(dir, 'page.mjs'), transformed);
const errorHelper = await readFile(new URL('../../src/lib/formatCreativeText.ts', import.meta.url), 'utf8');
await writeFile(join(dir, 'formatCreativeText.mjs'), ts.transpileModule(errorHelper, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
await writeFile(join(dir, 'stub.mjs'), 'export const supabase = new Proxy({}, { get: (_, key) => globalThis.__uiDb[key] });');
const Page = (await import(pathToFileURL(join(dir, 'page.mjs')).href)).default;
after(() => rm(dir, { recursive: true, force: true }));

async function mount({ motionJob = null, runError = null, stored = false, rpcError = null, approvedMotionSceneIds = [], sceneCount = 1, arenaConfigured = true, image: imageOverride } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://beat-vision-theta.vercel.app' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const image = imageOverride !== undefined ? imageOverride : { id: 'image-1', scene_id: 'scene-1', image_url: 'https://expired.test/image.jpg', storage_path: stored ? 'project-1/scene-images/asset.jpg' : null, status: 'approved', approved: true };
  const calls = [];
  const rpcCalls = [];
  const scenes = Array.from({ length: sceneCount }, (_, index) => ({
    id: `scene-${index + 1}`, scene_number: index + 1, start_time: index * 10,
    end_time: (index + 1) * 10, title: `Scene ${index + 1}`, status: 'approved',
  }));
  const approvedMotionAssets = () => approvedMotionSceneIds.map((id, index) => ({
    id: `motion-${index + 1}`, scene_id: id, status: 'approved',
    approved: true, video_url: `https://media.test/${id}.mp4`,
  }));
  globalThis.__uiDb = {
    from(table) {
      const filters = {};
      const query = {
        select() { return this; }, eq(k,v) { filters[k] = v; return this; }, order() { return this; }, limit() { return this; },
        single() { return this; }, maybeSingle() { return this; },
        then(resolve) {
          const data = table === 'visual_plans' ? { id: 'plan-1', status: 'approved', title: 'Locked plan' }
            : table === 'visual_plan_scenes' ? (filters.status ? scenes.filter(s => s.status === filters.status) : scenes)
            : table === 'scene_image_assets' ? image
            : table === 'motion_clip_assets' ? (filters.scene_id ? approvedMotionAssets().find(m => m.scene_id === filters.scene_id) ?? null : approvedMotionAssets())
            : table === 'generation_jobs' && filters.job_type === 'scene_motion' ? motionJob : null;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'approve_generation_cost') return { data: { id: 'approval-1', ...args }, error: null };
      return { data: rpcError ? null : { id: 'job-1', status: 'queued', job_type: args.p_job_type }, error: rpcError };
    },
    functions: { invoke: async (_name, { body }) => {
      if (body.action === 'models') return { data: { pricing_version: '2026-10-14.1', models: ['arena:flux-schnell', 'arena:ltx-video', 'arena:wan2.2-zerogpu', 'arena:shotstack'].map(id => ({ id, available: arenaConfigured, unavailable_reason: arenaConfigured ? null : 'Not configured on the server (missing ARENA_GATEWAY_URL, ARENA_GATEWAY_TOKEN).' })) }, error: null };
      calls.push(body);
      if (body.action === 'image_url') return { data: { image_url: 'https://fresh.test/image.jpg' }, error: null };
      return { data: { job: { id: 'job-1', status: 'processing', job_type: 'scene_motion' } }, error: runError ? new Error(runError) : null };
    } },
  };
  const root = createRoot(document.getElementById('root'));
  await act(async () => { root.render(React.createElement(Page, { projectId: 'project-1' })); });
  return {
    calls,
    rpcCalls,
    button: text => [...document.querySelectorAll('button')].find(b => b.textContent === text),
    click: async text => {
      const button = [...document.querySelectorAll('button')].find(b => b.textContent === text);
      assert.ok(button, `Missing button: ${text}`);
      await act(async () => { button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    },
    approve: async () => {
      const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Approve and render');
      if (button) await act(async () => { button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    },
    cleanup: async () => { await act(async () => root.unmount()); dom.window.close(); delete globalThis.__uiDb; },
  };
}

test('async motion keeps the workspace and exposes status without a completed asset', async () => {
  const view = await mount();
  try {
    await view.click('Generate Motion');
    await view.approve();
    assert.match(document.body.textContent, /Build the shots/);
    await view.click('Check Motion Status');
    assert.equal(view.calls.at(-1).jobId, 'job-1');
  } finally { await view.cleanup(); }
});

test('pending motion is restored from the database after reload', async () => {
  const view = await mount({ motionJob: { id: 'saved-job', status: 'processing' } });
  try {
    await view.click('Check Motion Status');
    assert.equal(view.calls.at(-1).jobId, 'saved-job');
  } finally { await view.cleanup(); }
});

test('recoverable provider errors do not hide the workspace', async () => {
  const view = await mount({ runError: 'Provider unavailable' });
  try {
    await view.click('Generate Motion');
    await view.approve();
    assert.match(document.body.textContent, /Provider unavailable/);
    assert.match(document.body.textContent, /Build the shots/);
  } finally { await view.cleanup(); }
});

test('stored private images are re-signed before display', async () => {
  const view = await mount({ stored: true });
  try { assert.equal(document.querySelector('img').src, 'https://fresh.test/image.jpg'); }
  finally { await view.cleanup(); }
});

test('async assembly retains its job and exposes the status control', async () => {
  const view = await mount({ approvedMotionSceneIds: ['scene-1'] });
  try {
    await view.click('Assemble Final Video');
    await view.approve();
    assert.match(document.body.textContent, /Build the shots/);
    await view.click('Check Assembly Status');
    assert.equal(view.calls.at(-1).jobId, 'job-1');
  } finally { await view.cleanup(); }
});

test('structured missing-motion assembly errors explain the prerequisite without calling a provider', async () => {
  const view = await mount({ approvedMotionSceneIds: ['scene-1'], rpcError: { message: 'ASSEMBLY_MOTION_NOT_FULLY_APPROVED', code: '55000', details: 'approved_motion=0 required=8' } });
  try {
    await view.click('Assemble Final Video');
    await view.approve();
    assert.match(document.querySelector('[role="alert"]').textContent, /approve.*motion clip.*every scene/i);
    assert.doesNotMatch(document.body.textContent, /\[object Object\]/);
    assert.match(document.body.textContent, /Build the shots/);
    assert.equal(view.calls.length, 0);
  } finally { await view.cleanup(); }
});

test('assembly is disabled and explains incomplete approved motion coverage without enqueueing', async () => {
  const view = await mount({ sceneCount: 2, approvedMotionSceneIds: ['scene-1'] });
  try {
    assert.equal(view.button('Assemble Final Video').disabled, true);
    assert.match(document.body.textContent, /1 of 2 scenes still need exactly one approved real motion clip/);
    assert.equal(view.rpcCalls.length, 0);
    assert.equal(view.calls.length, 0);
  } finally { await view.cleanup(); }
});

test('assembly becomes available only after every approved scene has an approved real clip', async () => {
  const view = await mount({ sceneCount: 2, approvedMotionSceneIds: ['scene-1', 'scene-2'] });
  try {
    assert.equal(view.button('Assemble Final Video').disabled, false);
    await view.click('Assemble Final Video');
    await view.approve();
    assert.equal(view.rpcCalls.filter(c => c.name === 'enqueue_assembly_generation').length, 1);
    assert.equal(view.calls.filter(c => c.action === 'run').length, 1);
  } finally { await view.cleanup(); }
});

test('assembly rechecks motion approval before enqueue and fails closed when stale', async () => {
  const approvedMotionSceneIds = ['scene-1'];
  const view = await mount({ approvedMotionSceneIds });
  try {
    assert.equal(view.button('Assemble Final Video').disabled, false);
    approvedMotionSceneIds.length = 0; // approval revoked in another tab since initial read
    await view.click('Assemble Final Video');
    await view.approve();
    assert.equal(view.rpcCalls.length, 0);
    assert.equal(view.calls.length, 0);
    assert.match(document.querySelector('[role="alert"]').textContent, /still need exactly one approved real motion clip/);
    assert.equal(view.button('Assemble Final Video').disabled, true);
  } finally { await view.cleanup(); }
});

test('extra approved motion duplicates do not satisfy assembly readiness', async () => {
  const view = await mount({ sceneCount: 2, approvedMotionSceneIds: ['scene-1', 'scene-1'] });
  try {
    assert.equal(view.button('Assemble Final Video').disabled, true);
    assert.equal(view.rpcCalls.length, 0);
  } finally { await view.cleanup(); }
});

test('generate opens a cost approval and nothing is recorded or rendered until approved', async () => {
  const view = await mount({ image: null });
  try {
    await view.click('Generate Scene Image');
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'approval dialog is shown');
    assert.match(dialog.textContent, /Flux Schnell/);
    assert.match(dialog.textContent, /\$0–\$0\.0012/);
    assert.match(dialog.textContent, /pixazo\.ai\/api\/pricing-plan/);
    assert.equal(view.rpcCalls.length, 0);
    assert.equal(view.calls.filter(c => c.action === 'run').length, 0);
    await view.click('Cancel');
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(view.rpcCalls.length, 0);
  } finally { await view.cleanup(); }
});

test('approval is recorded with the chosen model before enqueue and run', async () => {
  const view = await mount();
  try {
    const select = document.querySelector('select[aria-label="Model for motion clip"]');
    assert.ok(select, 'per-scene motion model picker is shown');
    await act(async () => { select.value = 'arena:wan2.2-zerogpu'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
    await view.click('Generate Motion');
    assert.match(document.querySelector('[role="dialog"]').textContent, /Cost unknown/);
    await view.approve();
    assert.deepEqual(view.rpcCalls.map(c => c.name), ['approve_generation_cost', 'enqueue_scene_generation']);
    const approval = view.rpcCalls[0].args;
    assert.equal(approval.p_model_id, 'arena:wan2.2-zerogpu');
    assert.equal(approval.p_scene_id, 'scene-1');
    assert.equal(approval.p_job_type, 'scene_motion');
    assert.equal(approval.p_estimate.kind, 'unknown');
    assert.equal(view.calls.filter(c => c.action === 'run').length, 1);
  } finally { await view.cleanup(); }
});

test('unconfigured providers show an explicit unavailable state and cannot be approved', async () => {
  const view = await mount({ arenaConfigured: false, image: null });
  try {
    assert.match(document.body.textContent, /Unavailable: Not configured on the server/);
    await view.click('Generate Scene Image');
    assert.equal(view.button('Approve and render').disabled, true);
    assert.equal(view.rpcCalls.length, 0);
  } finally { await view.cleanup(); }
});
