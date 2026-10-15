import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
const dir = await mkdtemp(join(rootDir, '.integration-test-'));

// Load and transform ProductionWorkspacePage
const pwpSource = await readFile(join(rootDir, 'src/pages/ProductionWorkspacePage.tsx'), 'utf8');
const pwpTranspiled = ts.transpileModule(
  pwpSource
    .replace('"../lib/supabase/client"', '"./stub.mjs"')
    .replace('"../lib/formatCreativeText"', '"./formatCreativeText.mjs"')
    .replace('"../components/navigation/StudioHeader"', '"./header.mjs"'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }
).outputText;
await writeFile(join(dir, 'ProductionWorkspacePage.mjs'), pwpTranspiled);

// Load and transform helpers
const fctSource = await readFile(join(rootDir, 'src/lib/formatCreativeText.ts'), 'utf8');
await writeFile(join(dir, 'formatCreativeText.mjs'), ts.transpileModule(fctSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);

await writeFile(join(dir, 'stub.mjs'), 'export const supabase = new Proxy({}, { get: (_, key) => globalThis.__uiDb[key] });');
await writeFile(join(dir, 'header.mjs'), 'export default function StudioHeader() { return null; }');

const ProductionWorkspacePage = (await import(pathToFileURL(join(dir, 'ProductionWorkspacePage.mjs')).href)).default;

after(() => rm(dir, { recursive: true, force: true }));

async function mountWorkspace({ motionJob = null, runError = null, stored = false, rpcError = null, approvedMotionSceneIds = [], sceneCount = 2 } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://beat-vision-theta.vercel.app' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const image = { id: 'image-1', scene_id: 'scene-1', image_url: 'https://expired.test/image.jpg', storage_path: stored ? 'project-1/scene-images/asset.jpg' : null, status: 'approved', approved: true };
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
      return { data: rpcError ? null : { id: 'job-1', status: 'queued', job_type: args.p_job_type }, error: rpcError };
    },
    functions: { invoke: async (_name, { body }) => {
      calls.push(body);
      if (body.action === 'image_url') return { data: { image_url: 'https://fresh.test/image.jpg' }, error: null };
      return { data: { job: { id: 'job-1', status: 'processing', job_type: 'scene_motion' } }, error: runError ? new Error(runError) : null };
    } },
  };

  const root = createRoot(document.getElementById('root'));
  await act(async () => { root.render(React.createElement(ProductionWorkspacePage, { projectId: 'project-1' })); });

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

test('Integration 2026-10-11: Motion -> Final Assembly disabled state when motion coverage incomplete', async () => {
  const view = await mountWorkspace({ sceneCount: 2, approvedMotionSceneIds: ['scene-1'] });
  try {
    const assembleBtn = view.button('Assemble Final Video');
    assert.ok(assembleBtn, 'Assemble button should exist');
    assert.equal(assembleBtn.disabled, true, 'Assemble button should be disabled when motion is incomplete');
    assert.match(document.body.textContent, /1 of 2 scenes still need exactly one approved real motion clip/);
    assert.equal(view.rpcCalls.length, 0, 'No RPC should be enqueued when disabled');
  } finally {
    await view.cleanup();
  }
});

test('Integration 2026-10-11: Motion -> Final Assembly enabled when all scenes have approved motion clips', async () => {
  const view = await mountWorkspace({ sceneCount: 2, approvedMotionSceneIds: ['scene-1', 'scene-2'] });
  try {
    const assembleBtn = view.button('Assemble Final Video');
    assert.ok(assembleBtn, 'Assemble button should exist');
    assert.equal(assembleBtn.disabled, false, 'Assemble button should be enabled when motion is fully approved');
    await view.click('Assemble Final Video');
    assert.equal(view.rpcCalls.filter(c => c.name === 'enqueue_assembly_generation').length, 1);
  } finally {
    await view.cleanup();
  }
});
