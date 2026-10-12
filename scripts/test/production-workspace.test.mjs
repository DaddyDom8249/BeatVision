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
const transformed = ts.transpileModule(source.replace('"../lib/supabase/client"', '"./stub.mjs"').replace('"../lib/formatCreativeText"', '"./formatCreativeText.mjs"'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
await writeFile(join(dir, 'page.mjs'), transformed);
const errorHelper = await readFile(new URL('../../src/lib/formatCreativeText.ts', import.meta.url), 'utf8');
await writeFile(join(dir, 'formatCreativeText.mjs'), ts.transpileModule(errorHelper, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
await writeFile(join(dir, 'stub.mjs'), 'export const supabase = new Proxy({}, { get: (_, key) => globalThis.__uiDb[key] });');
const Page = (await import(pathToFileURL(join(dir, 'page.mjs')).href)).default;
after(() => rm(dir, { recursive: true, force: true }));

async function mount({ motionJob = null, runError = null, stored = false, rpcError = null, approvedMotionSceneIds = [], sceneCount = 1, motionAssets = null, sceneStatuses = [], readinessError = null } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://beat-vision-theta.vercel.app' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const image = { id: 'image-1', scene_id: 'scene-1', image_url: 'https://expired.test/image.jpg', storage_path: stored ? 'project-1/scene-images/asset.jpg' : null, status: 'approved', approved: true };
  const calls = [];
  const rpcCalls = [];
  const scenes = Array.from({ length: sceneCount }, (_, index) => ({
    id: `scene-${index + 1}`, scene_number: index + 1, start_time: index * 10,
    end_time: (index + 1) * 10, title: `Scene ${index + 1}`, status: sceneStatuses[index] ?? 'approved',
  }));
  const approvedMotionAssets = () => motionAssets ?? approvedMotionSceneIds.map((id, index) => ({
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
            : table === 'motion_clip_assets' ? (filters.scene_id ? approvedMotionAssets().find(m => m.scene_id === filters.scene_id) ?? null : approvedMotionAssets().filter(m => (!filters.status || m.status === filters.status) && (filters.approved === undefined || m.approved === filters.approved)))
            : table === 'generation_jobs' && filters.job_type === 'scene_motion' ? motionJob : null;
          return Promise.resolve({ data, error: table === 'motion_clip_assets' && !filters.scene_id ? readinessError : null }).then(resolve);
        },
      };
      return query;
    },
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
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


const approvedClip = (sceneId, videoUrl = 'https://media.test/' + sceneId + '.mp4') => ({
  id: 'motion-' + sceneId, scene_id: sceneId, status: 'approved', approved: true, video_url: videoUrl,
});

for (const [label, videoUrl] of [
  ['empty', ''], ['whitespace', '   '], ['plain text', 'not-a-video-url'],
  ['unsupported scheme', 'javascript:alert(1)'], ['null', null],
  ['missing host', 'https://'], ['invalid host', 'https://[broken'], ['non-string object', { url: 'https://media.test/clip.mp4' }],
]) {
  test('assembly stays disabled for ' + label + ' media references', async () => {
    const view = await mount({ motionAssets: [approvedClip('scene-1', videoUrl)] });
    try {
      assert.equal(view.button('Assemble Final Video').disabled, true);
      assert.equal(view.rpcCalls.length, 0);
      assert.equal(view.calls.length, 0);
    } finally { await view.cleanup(); }
  });
}

test('exactly one approved HTTP(S) clip per scene enables assembly without generation or approval', async () => {
  const assets = [approvedClip('scene-1'), approvedClip('scene-2', 'http://media.test/scene-2.mp4')];
  const original = JSON.stringify(assets);
  const view = await mount({ sceneCount: 2, motionAssets: assets });
  try {
    assert.equal(view.button('Assemble Final Video').disabled, false);
    assert.equal(view.rpcCalls.length, 0);
    assert.equal(view.calls.length, 0);
    assert.equal(JSON.stringify(assets), original);
  } finally { await view.cleanup(); }
});

test('two real approved clips for the same scene are a conflict even with full coverage', async () => {
  const view = await mount({ sceneCount: 2, motionAssets: [
    approvedClip('scene-1'), { ...approvedClip('scene-1'), id: 'duplicate-motion' }, approvedClip('scene-2'),
  ] });
  try {
    assert.equal(view.button('Assemble Final Video').disabled, true);
    assert.equal(view.rpcCalls.length, 0);
    assert.equal(view.calls.length, 0);
  } finally { await view.cleanup(); }
});

test('extra approved clip from another scene fails closed despite complete coverage', async () => {
  const view = await mount({ motionAssets: [approvedClip('scene-1'), approvedClip('other-scene')] });
  try {
    assert.equal(view.button('Assemble Final Video').disabled, true);
    assert.match(document.body.textContent, /inconsistent/);
    assert.equal(view.rpcCalls.length, 0);
    assert.equal(view.calls.length, 0);
  } finally { await view.cleanup(); }
});

test('a generated unapproved attempt cannot stand in for approved motion', async () => {
  const view = await mount({ motionAssets: [{ ...approvedClip('scene-1'), status: 'generated', approved: false }] });
  try {
    assert.equal(view.button('Assemble Final Video').disabled, true);
    assert.equal(view.rpcCalls.length, 0);
    assert.equal(view.calls.length, 0);
  } finally { await view.cleanup(); }
});

test('draft scenes keep assembly disabled even when each scene has approved motion', async () => {
  const view = await mount({ sceneCount: 2, sceneStatuses: ['approved', 'draft'],
    motionAssets: [approvedClip('scene-1'), approvedClip('scene-2')] });
  try {
    assert.equal(view.button('Assemble Final Video').disabled, true);
    assert.match(document.body.textContent, /Approve every scene/);
    assert.equal(view.rpcCalls.length, 0);
    assert.equal(view.calls.length, 0);
  } finally { await view.cleanup(); }
});

test('unreadable motion approvals keep assembly disabled and expose the error', async () => {
  const view = await mount({ motionAssets: [approvedClip('scene-1')], readinessError: { message: 'approval read denied' } });
  try {
    assert.equal(view.button('Assemble Final Video').disabled, true);
    assert.match(document.body.textContent, /approval read denied/);
    assert.equal(view.rpcCalls.length, 0);
    assert.equal(view.calls.length, 0);
  } finally { await view.cleanup(); }
});
