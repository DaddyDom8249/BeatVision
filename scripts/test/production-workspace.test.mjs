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
const transformed = ts.transpileModule(source.replace('"../lib/supabase/client"', '"./stub.mjs"'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
await writeFile(join(dir, 'page.mjs'), transformed);
await writeFile(join(dir, 'stub.mjs'), 'export const supabase = new Proxy({}, { get: (_, key) => globalThis.__uiDb[key] });');
const Page = (await import(pathToFileURL(join(dir, 'page.mjs')).href)).default;
after(() => rm(dir, { recursive: true, force: true }));

async function mount({ motionJob = null, imageJob = null, assemblyJob = null, motionAsset = null, jobsMap = {}, runError = null, stored = false, rpcError = null } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://beat-vision-theta.vercel.app' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const image = { id: 'image-1', scene_id: 'scene-1', image_url: 'https://expired.test/image.jpg', storage_path: stored ? 'project-1/scene-images/asset.jpg' : null, status: 'approved', approved: true };
  const calls = [];
  globalThis.__uiDb = {
    from(table) {
      const filters = {};
      const query = {
        select() { return this; }, eq(k,v) { filters[k] = v; return this; }, order() { return this; }, limit() { return this; },
        single() { return this; }, maybeSingle() { return this; },
        then(resolve) {
          let data = null;
          if (table === 'visual_plans') data = { id: 'plan-1', status: 'approved', title: 'Locked plan' };
          else if (table === 'visual_plan_scenes') data = [{ id: 'scene-1', scene_number: 1, start_time: 0, end_time: 10, title: 'First scene', status: 'approved' }];
          else if (table === 'scene_image_assets') data = image;
          else if (table === 'motion_clip_assets') data = motionAsset;
          else if (table === 'generation_jobs') {
            if (filters.id && jobsMap[filters.id]) data = jobsMap[filters.id];
            else if (filters.job_type === 'scene_motion') data = motionJob;
            else if (filters.job_type === 'scene_image') data = imageJob;
            else if (filters.job_type === 'assembly') data = assemblyJob;
          }
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
    rpc: async (_name, args) => ({ data: { id: 'job-1', status: 'queued', job_type: args.p_job_type }, error: null }),
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

test('motion provenance accurately detects procedural animation from historical polling job when newer retry job exists', async () => {
  const motionAsset = {
    id: 'motion-1',
    generation_job_id: 'job-a',
    provider: 'arena',
    model: 'ltx-video',
    video_url: 'https://test/procedural.mp4',
    status: 'generated',
  };
  const jobsMap = {
    'job-a': {
      id: 'job-a',
      output: {
        arena_status_response: {
          result: { generation_type: 'PROCEDURAL_MOTION' },
        },
      },
    },
  };
  const motionJob = { id: 'job-b', status: 'processing', job_type: 'scene_motion' };

  const view = await mount({ motionAsset, jobsMap, motionJob });
  try {
    assert.match(
      document.body.textContent,
      /Procedural image animation \(pan\/zoom\), not AI-generated subject motion\./
    );
    assert.doesNotMatch(document.body.textContent, /Provider: arena · Model: ltx-video/);
  } finally {
    await view.cleanup();
  }
});

test('motion provenance accurately detects procedural animation from historical polling job when newer retry job exists', async () => {
  const motionAsset = {
    id: 'motion-1',
    generation_job_id: 'job-a',
    provider: 'arena',
    model: 'ltx-video',
    video_url: 'https://test/procedural.mp4',
    status: 'generated',
  };
  const jobsMap = {
    'job-a': {
      id: 'job-a',
      output: {
        arena_status_response: {
          result: { generation_type: 'PROCEDURAL_MOTION' },
        },
      },
    },
  };
  const motionJob = { id: 'job-b', status: 'processing', job_type: 'scene_motion' };

  const view = await mount({ motionAsset, jobsMap, motionJob });
  try {
    assert.match(
      document.body.textContent,
      /Procedural image animation \(pan\/zoom\), not AI-generated subject motion\./
    );
    assert.doesNotMatch(document.body.textContent, /Provider: arena · Model: ltx-video/);
  } finally {
    await view.cleanup();
  }
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
