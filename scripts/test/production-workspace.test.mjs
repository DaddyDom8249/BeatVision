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
const transformed = ts.transpileModule(source.replace('"../lib/supabase/client"', '"./stub.mjs"').replace('"../lib/formatCreativeText"', '"./formatCreativeText.mjs"').replace('"../components/scenes/TakeHistory"', '"./TakeHistory.mjs"').replace('"../lib/beatvision/scenes/takes"', '"./takes.mjs"'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
await writeFile(join(dir, 'page.mjs'), transformed);
const errorHelper = await readFile(new URL('../../src/lib/formatCreativeText.ts', import.meta.url), 'utf8');
await writeFile(join(dir, 'formatCreativeText.mjs'), ts.transpileModule(errorHelper, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
const tsOpts = { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } };
await writeFile(join(dir, 'takes.mjs'), ts.transpileModule(await readFile(new URL('../../src/lib/beatvision/scenes/takes.ts', import.meta.url), 'utf8'), tsOpts).outputText);
await writeFile(join(dir, 'TakeHistory.mjs'), ts.transpileModule((await readFile(new URL('../../src/components/scenes/TakeHistory.tsx', import.meta.url), 'utf8')).replaceAll('"../../lib/beatvision/scenes/takes"', '"./takes.mjs"'), tsOpts).outputText);
await writeFile(join(dir, 'stub.mjs'), 'export const supabase = new Proxy({}, { get: (_, key) => globalThis.__uiDb[key] });');
const Page = (await import(pathToFileURL(join(dir, 'page.mjs')).href)).default;
after(() => rm(dir, { recursive: true, force: true }));

async function mount({ imageTakes = null, motionTakes = null, rpcData = null, motionJob = null, runError = null, stored = false, rpcError = null, approvedMotionSceneIds = [], sceneCount = 1 } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://beat-vision-theta.vercel.app' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const image = { id: 'image-1', scene_id: 'scene-1', image_url: 'https://expired.test/image.jpg', storage_path: stored ? 'project-1/scene-images/asset.jpg' : null, status: 'approved', approved: true, created_at: '2026-10-01T00:00:00Z' };
  const images = imageTakes ?? [image];
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
            : table === 'scene_image_assets' ? images
            : table === 'motion_clip_assets' ? (filters.scene_id ? (motionTakes ?? approvedMotionAssets().filter(m => m.scene_id === filters.scene_id)) : approvedMotionAssets())
            : table === 'generation_jobs' && filters.job_type === 'scene_motion' ? motionJob : null;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      if (rpcData && rpcData[name]) return { data: rpcData[name], error: null };
      return { data: rpcError ? null : { id: 'job-1', status: 'queued', job_type: args.p_job_type }, error: rpcError };
    },
    functions: { invoke: async (_name, { body }) => {
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
    cleanup: async () => { await act(async () => root.unmount()); dom.window.close(); delete globalThis.__uiDb; },
  };
}

test('async motion keeps the workspace and exposes status without a completed asset', async () => {
  const view = await mount();
  try {
    await view.click('Generate Motion');
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
    assert.match(document.body.textContent, /Build the shots/);
    await view.click('Check Assembly Status');
    assert.equal(view.calls.at(-1).jobId, 'job-1');
  } finally { await view.cleanup(); }
});

test('structured missing-motion assembly errors explain the prerequisite without calling a provider', async () => {
  const view = await mount({ approvedMotionSceneIds: ['scene-1'], rpcError: { message: 'ASSEMBLY_MOTION_NOT_FULLY_APPROVED', code: '55000', details: 'approved_motion=0 required=8' } });
  try {
    await view.click('Assemble Final Video');
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

// ---- Shot control and retakes ----
const take = (id, at, extra = {}) => ({ id, scene_id: 'scene-1', image_url: `https://media.test/${id}.jpg`, storage_path: null, status: 'generated', approved: false, created_at: at, ...extra });
const approvedTakeRow = (id, at) => take(id, at, { status: 'approved', approved: true });

test('generate stays available as Retake once a take exists, and retake requires explicit confirmation', async () => {
  const view = await mount({ imageTakes: [take('image-1', '2026-10-01T00:00:00Z')] });
  try {
    assert.equal(view.button('Generate Scene Image'), undefined);
    assert.equal(view.button('Retake Image').disabled, false);
    await view.click('Retake Image');
    assert.equal(view.rpcCalls.length, 0, 'opening the confirm must not enqueue');
    assert.equal(view.calls.length, 0, 'opening the confirm must not call a provider');
    await view.click('Cancel');
    assert.equal(view.rpcCalls.length, 0);
    await view.click('Retake Image');
    await view.click('Confirm Image Retake');
    const enq = view.rpcCalls.filter(c => c.name === 'enqueue_scene_generation');
    assert.equal(enq.length, 1);
    assert.equal(enq[0].args.p_job_type, 'scene_image');
  } finally { await view.cleanup(); }
});

test('take history numbers takes chronologically and shows the approved take, not the newest', async () => {
  const view = await mount({ imageTakes: [take('image-3', '2026-10-03T00:00:00Z'), approvedTakeRow('image-1', '2026-10-01T00:00:00Z'), take('image-2', '2026-10-02T00:00:00Z')] });
  try {
    assert.match(document.body.textContent, /IMAGE TAKES \(3\)/);
    assert.match(document.body.textContent, /Viewing Take 1 · approved/);
    assert.equal(document.querySelector('img').src, 'https://media.test/image-1.jpg');
    await view.click('Take 3');
    assert.equal(document.querySelector('img').src, 'https://media.test/image-3.jpg');
  } finally { await view.cleanup(); }
});

test('approving a candidate while another take is approved requires confirmation and uses the replace RPC naming the current take', async () => {
  const view = await mount({ imageTakes: [take('image-2', '2026-10-02T00:00:00Z'), approvedTakeRow('image-1', '2026-10-01T00:00:00Z')] });
  try {
    await view.click('Take 2');
    await view.click('Replace Approved Take');
    assert.equal(view.rpcCalls.length, 0, 'first click only opens the confirmation');
    assert.match(document.body.textContent, /unapprove Take 1 and approve Take 2/);
    await view.click('Confirm Replace Approved Image');
    assert.deepEqual(view.rpcCalls.map(c => c.name), ['replace_approved_scene_image']);
    assert.deepEqual(view.rpcCalls[0].args, { p_asset_id: 'image-2', p_expected_current_id: 'image-1' });
    assert.equal(view.rpcCalls.some(c => c.name === 'approve_scene_image_asset'), false);
  } finally { await view.cleanup(); }
});

test('first approval with no approved take uses the plain approve RPC', async () => {
  const view = await mount({ imageTakes: [take('image-1', '2026-10-01T00:00:00Z')] });
  try {
    await view.click('Approve Image');
    assert.deepEqual(view.rpcCalls.map(c => c.name), ['approve_scene_image_asset']);
  } finally { await view.cleanup(); }
});

test('conflicting approvals fail closed: no approve or replace control is offered', async () => {
  const view = await mount({ imageTakes: [approvedTakeRow('image-2', '2026-10-02T00:00:00Z'), approvedTakeRow('image-1', '2026-10-01T00:00:00Z'), take('image-3', '2026-10-03T00:00:00Z')] });
  try {
    assert.match(document.querySelector('[role="alert"]').textContent, /More than one image take is approved/);
    assert.equal(view.button('Approve Image'), undefined);
    assert.equal(view.button('Replace Approved Take'), undefined);
    assert.equal(view.button('Generate Motion').disabled, true, 'motion needs exactly one approved image');
  } finally { await view.cleanup(); }
});

test('first/last frame selection goes through the keyframe RPC and is shown on the take', async () => {
  const view = await mount({
    imageTakes: [take('image-2', '2026-10-02T00:00:00Z'), approvedTakeRow('image-1', '2026-10-01T00:00:00Z')],
    rpcData: { set_scene_keyframe: { first_frame_asset_id: null, last_frame_asset_id: 'image-2' } },
  });
  try {
    await view.click('Use Take 2 as Last Frame');
    assert.deepEqual(view.rpcCalls.at(-1), { name: 'set_scene_keyframe', args: { p_scene_id: 'scene-1', p_role: 'last', p_asset_id: 'image-2' } });
    assert.match(document.querySelector('[data-take-id="image-2"]').textContent, /LAST FRAME/);
    assert.equal(view.button('Use Take 2 as Last Frame').disabled, true);
  } finally { await view.cleanup(); }
});

test('motion retake requires confirmation and replacing approved motion names the current clip', async () => {
  const view = await mount({
    imageTakes: [approvedTakeRow('image-1', '2026-10-01T00:00:00Z')],
    motionTakes: [
      { id: 'clip-2', scene_id: 'scene-1', video_url: 'https://media.test/c2.mp4', status: 'generated', approved: false, created_at: '2026-10-02T00:00:00Z', provider: 'p', model: 'm' },
      { id: 'clip-1', scene_id: 'scene-1', video_url: 'https://media.test/c1.mp4', status: 'approved', approved: true, created_at: '2026-10-01T00:00:00Z', provider: 'p', model: 'm' },
    ],
  });
  try {
    assert.equal(view.button('Generate Motion'), undefined);
    await view.click('Retake Motion');
    assert.equal(view.rpcCalls.length, 0);
    await view.click('Cancel');
    await view.click('Take 2');
    await view.click('Replace Approved Motion');
    assert.equal(view.rpcCalls.length, 0);
    await view.click('Confirm Replace Approved Motion');
    assert.deepEqual(view.rpcCalls.find(c => c.name === 'replace_approved_motion_clip').args, { p_asset_id: 'clip-2', p_expected_current_id: 'clip-1' });
  } finally { await view.cleanup(); }
});
