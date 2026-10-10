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

async function mount({ motionJob = null, imageJob = null, assemblyJob = null, motionAsset = null, historicalJob = null, runError = null, stored = false, rpcError = null, runJob = null } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://beat-vision-theta.vercel.app' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const image = { id: 'image-1', scene_id: 'scene-1', image_url: 'https://expired.test/image.jpg', storage_path: stored ? 'project-1/scene-images/asset.jpg' : null, status: 'approved', approved: true };
  const calls = [];
  const rpcCalls = [];
  const historicalQueries = [];
  globalThis.__uiDb = {
    from(table) {
      const filters = {};
      const query = {
        select() { return this; }, eq(k,v) { filters[k] = v; return this; }, order() { return this; }, limit() { return this; },
        single() { return this; }, maybeSingle() { return this; },
        then(resolve) {
          const data = table === 'visual_plans' ? { id: 'plan-1', status: 'approved', title: 'Locked plan' }
            : table === 'visual_plan_scenes' ? [{ id: 'scene-1', scene_number: 1, start_time: 0, end_time: 10, title: 'First scene', status: 'approved' }]
            : table === 'scene_image_assets' ? image
            : table === 'motion_clip_assets' ? motionAsset
            : table === 'generation_jobs' && filters.id ? (historicalQueries.push({ ...filters }), historicalJob?.id === filters.id ? historicalJob : null)
            : table === 'generation_jobs' ? (filters.job_type === 'scene_motion' ? motionJob : filters.job_type === 'scene_image' ? imageJob : assemblyJob) : null;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
    rpc: async (_name, args) => { rpcCalls.push({ name: _name, args }); return { data: rpcError ? null : { id: 'job-1', status: 'queued', job_type: args.p_job_type }, error: rpcError }; },
    functions: { invoke: async (_name, { body }) => {
      calls.push(body);
      if (body.action === 'image_url') return { data: { image_url: 'https://fresh.test/image.jpg' }, error: null };
      return { data: { job: runJob ?? { id: 'job-1', status: 'processing', job_type: 'scene_motion' } }, error: runError ? new Error(runError) : null };
    } },
  };
  const root = createRoot(document.getElementById('root'));
  await act(async () => { root.render(React.createElement(Page, { projectId: 'project-1' })); });
  return {
    calls,
    rpcCalls,
    historicalQueries,
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
  const view = await mount();
  try {
    await view.click('Assemble Final Video');
    assert.match(document.body.textContent, /Build the shots/);
    await view.click('Check Assembly Status');
    assert.equal(view.calls.at(-1).jobId, 'job-1');
  } finally { await view.cleanup(); }
});

test('structured missing-motion assembly errors explain the prerequisite without calling a provider', async () => {
  const view = await mount({ rpcError: { message: 'ASSEMBLY_MOTION_NOT_FULLY_APPROVED', code: '55000', details: 'approved_motion=0 required=8' } });
  try {
    await view.click('Assemble Final Video');
    assert.match(document.querySelector('[role="alert"]').textContent, /approve.*motion clip.*every scene/i);
    assert.doesNotMatch(document.body.textContent, /\[object Object\]/);
    assert.match(document.body.textContent, /Build the shots/);
    assert.equal(view.calls.length, 0);
  } finally { await view.cleanup(); }
});

for (const [type, prop, button] of [
  ['scene_motion', 'motionJob', 'Check Motion Status'],
  ['scene_image', 'imageJob', 'Check Image Status'],
  ['assembly', 'assemblyJob', 'Check Assembly Status'],
]) {
  test(`submitted ${type} resumes through polling without enqueueing a duplicate`, async () => {
    const view = await mount({ [prop]: { id: 'submitted-job', status: 'submitted', job_type: type } });
    try {
      await view.click(button);
      assert.equal(view.calls.at(-1).jobId, 'submitted-job');
      assert.equal(view.calls.at(-1).action, 'poll');
      assert.equal(view.rpcCalls.length, 0);
    } finally { await view.cleanup(); }
  });
}

test('a new motion job still dispatches once with run', async () => {
  const view = await mount();
  try {
    await view.click('Generate Motion');
    assert.equal(view.calls.at(-1).action, 'run');
    assert.equal(view.rpcCalls.length, 1);
  } finally { await view.cleanup(); }
});


test('restored assembly exposes the actual provider stage and last successful check', async () => {
  const view = await mount({ assemblyJob: { id: 'assembly-1', status: 'processing', output: { last_polled_at: '2026-10-10T05:50:01.202Z', arena_status_response: { result: { status: 'preprocessing' } } } } });
  try {
    assert.match(document.body.textContent, /Assembly status: processing/);
    assert.match(document.body.textContent, /Provider stage: preprocessing/);
    assert.match(document.body.textContent, /Last checked: 2026-10-10T05:50:01.202Z/);
    assert.doesNotMatch(document.body.textContent, /FINAL VIDEO COMPLETE/);
  } finally { await view.cleanup(); }
});
test('checking assembly shows its returned pending stage without submitting again', async () => {
  const view = await mount({ assemblyJob: { id: 'assembly-1', status: 'processing' }, runJob: { id: 'assembly-1', status: 'processing', output: { last_polled_at: '2026-10-10T05:51:00.000Z', arena_status_response: { result: { status: 'rendering' } } } } });
  try {
    await view.click('Check Assembly Status');
    assert.match(document.body.textContent, /Provider stage: rendering/);
    assert.match(document.body.textContent, /Last checked: 2026-10-10T05:51:00.000Z/);
    assert.equal(view.calls.at(-1).action, 'poll');
    assert.equal(view.rpcCalls.length, 0);
    assert.doesNotMatch(document.body.textContent, /FINAL VIDEO COMPLETE/);
  } finally { await view.cleanup(); }
});

test('motion badge uses the completed asset job rather than an unrelated newer retry', async () => {
  const motionAsset = {
    id: 'motion-old', scene_id: 'scene-1', generation_job_id: 'completed-motion-job',
    model: 'ltx-video', provider: 'arena', status: 'approved',
    video_url: 'https://example.test/approved-motion.mp4',
  };
  const historicalJob = {
    id: 'completed-motion-job', status: 'completed', job_type: 'scene_motion',
    output: { arena_status_response: { result: { generation_type: 'PROCEDURAL_MOTION' } } },
  };
  const motionJob = { id: 'new-retry-job', status: 'submitted', job_type: 'scene_motion' };
  const view = await mount({ motionAsset, historicalJob, motionJob });
  try {
    assert.match(document.body.textContent, /Procedural image animation \(pan\/zoom\), not AI-generated subject motion\./);
    assert.doesNotMatch(document.body.textContent, /Provider: arena · Model: ltx-video/);
    assert.equal(view.historicalQueries.length, 1);
    assert.deepEqual(view.historicalQueries[0], {
      project_id: 'project-1', visual_plan_scene_id: 'scene-1',
      job_type: 'scene_motion', id: 'completed-motion-job',
    });
    assert.equal(view.rpcCalls.length, 0);
    assert.equal(view.calls.length, 0);
  } finally { await view.cleanup(); }
});
