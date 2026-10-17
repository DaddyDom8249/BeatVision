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
const transformed = ts.transpileModule(
  source
    .replace('"../lib/supabase/client"', '"./stub.mjs"')
    .replace('"../lib/formatCreativeText"', '"./formatCreativeText.mjs"')
    .replace('"../components/navigation/StudioHeader"', '"./header.mjs"'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }
).outputText;
await writeFile(join(dir, 'page.mjs'), transformed);
const errorHelper = await readFile(new URL('../../src/lib/formatCreativeText.ts', import.meta.url), 'utf8');
await writeFile(join(dir, 'formatCreativeText.mjs'), ts.transpileModule(errorHelper, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
await writeFile(join(dir, 'stub.mjs'), 'export const supabase = new Proxy({}, { get: (_, key) => globalThis.__uiDb[key] });');
await writeFile(join(dir, 'header.mjs'), 'export default function StudioHeader() { return null; }');
const Page = (await import(pathToFileURL(join(dir, 'page.mjs')).href)).default;
after(() => rm(dir, { recursive: true, force: true }));

async function mount({ imageAssets = null, motionAssets = null, motionJob = null, imageJob = null, assemblyJob = null, motionAsset = null, historicalJob = null, runError = null, stored = false, rpcError = null, runJob = null, approvedMotionSceneIds = ['scene-1'], sceneRecord = null } = {}) {
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
            : table === 'visual_plan_scenes' ? [sceneRecord ?? { id: 'scene-1', scene_number: 1, start_time: 0, end_time: 10, title: 'First scene', status: 'approved' }]
            : table === 'scene_image_assets' ? imageAssets ?? image
            : table === 'motion_clip_assets' ? (filters.approved === true ? approvedMotionSceneIds.map((scene_id,i)=>({id:'approved-'+i,scene_id,status:'approved',approved:true,video_url:'https://fixture.test/'+i+'.mp4'})) : motionAssets ?? motionAsset)
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
      if (body.action === 'enqueue_ai_motion') return { data: { job: { id: 'job-1', status: 'queued', job_type: 'scene_motion' } }, error: runError ? new Error(runError) : null };
      if (body.action === 'motion_url') return { data: { video_url: 'https://fresh.test/motion.mp4' }, error: null };
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
    button: text => [...document.querySelectorAll('button')].find(b=>b.textContent === text),
    click: async text => {
      if (text === 'Generate Motion') { const box = document.querySelector('input[type=checkbox]'); if (box && !box.checked) await act(async () => { box.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); }
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
    assert.match(document.body.textContent, /Shot Monitor/);
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
    assert.match(document.body.textContent, /Shot Monitor/);
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
    assert.match(document.body.textContent, /Shot Monitor/);
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
    assert.match(document.body.textContent, /Shot Monitor/);
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
    assert.equal(view.rpcCalls.length, 0);
    assert.equal(view.calls.filter(call => call.action === 'enqueue_ai_motion').length, 1);
    assert.equal(view.calls[0].acceptedTerms, true);
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

test('completed final video downloads its actual bytes with an mp4 filename', async () => {
 const view=await mount({assemblyJob:{id:'assembly-1',status:'completed',output:{final_video:{video_url:'https://media.test/final.mp4'}}}});
 const oldFetch=globalThis.fetch,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldClick=window.HTMLAnchorElement.prototype.click;
 let saved, requested, created;
 globalThis.fetch=async url=>{requested=url;return new Response('real fixture video bytes',{headers:{'content-type':'video/mp4'}})};
 URL.createObjectURL=blob=>{created=blob;return 'blob:fixture-video'};
 URL.revokeObjectURL=()=>{};
 window.HTMLAnchorElement.prototype.click=function(){saved={href:this.href,filename:this.download}};
 try{
  await view.click('Download Video');
  assert.equal(requested,'https://media.test/final.mp4');
  assert.equal(created.size,24);
  assert.equal(saved.href,'blob:fixture-video');
  assert.equal(saved.filename,'BeatVision-project-1.mp4');
  assert.equal(view.rpcCalls.length,0);
 }finally{globalThis.fetch=oldFetch;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;window.HTMLAnchorElement.prototype.click=oldClick;await view.cleanup()}
});
for(const [label,response] of [
 ['HTTP error',()=>new Response('Not found',{status:404})],
 ['empty media',()=>new Response('',{headers:{'content-type':'video/mp4'}})],
 ['non-video response',()=>new Response('<html>error</html>',{headers:{'content-type':'text/html'}})]
])test('download reports '+label+' without claiming a saved file',async()=>{
 const view=await mount({assemblyJob:{id:'assembly-1',status:'completed',output:{final_video:{video_url:'https://media.test/final.mp4'}}}});
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>response();
 try{
  await view.click('Download Video');
  assert.match(document.querySelector('[role="alert"]').textContent,/download/i);
  assert.match(document.body.textContent,/FINAL VIDEO COMPLETE/);
  assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='Download Video'&&!b.disabled));
 }finally{globalThis.fetch=oldFetch;await view.cleanup()}
});
test('pending assembly cannot download an uncompleted provider URL',async()=>{
 const view=await mount({assemblyJob:{id:'assembly-1',status:'processing',output:{final_video:{video_url:'https://media.test/final.mp4'}}}});
 try{assert.ok(![...document.querySelectorAll('button')].some(b=>b.textContent==='Download Video'))}finally{await view.cleanup()}
});

test('AI motion requires model terms and appends beside an approved procedural clip', async () => {
  const view = await mount({ motionAsset: { id: 'old-motion', generation_job_id: 'old-job', provider: 'shotstack', model: 'image-motion', status: 'approved', approved: true, video_url: 'https://original.test/approved.mp4' }, historicalJob: { id: 'old-job', status: 'completed' } });
  try {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Generate Motion');
    assert.ok(button); assert.equal(button.disabled, true);
    assert.match(document.body.textContent, /2-second AI motion preview/);
    await view.click('Generate Motion');
    assert.equal(view.calls[0].action, 'enqueue_ai_motion');
    assert.equal(view.calls[0].acceptedTerms, true);
    assert.equal(view.rpcCalls.length, 0);
    assert.equal(view.calls.filter(c => c.action === 'run').length, 1);
  } finally { await view.cleanup(); }
});

test('HF motion refresh uses owner-authorized private playback URL', async () => {
  const view = await mount({ motionAsset: { id: 'hf-motion', generation_job_id: 'hf-job', provider: 'huggingface-zerogpu', model: 'ltxv-13b-0.9.8-distilled', status: 'generated', video_url: 'https://expired.test/video.mp4' }, historicalJob: { id: 'hf-job', status: 'completed' } });
  try {
    assert.equal(document.querySelector('video').getAttribute('src'), 'https://fresh.test/motion.mp4');
    const call = view.calls.find(c => c.action === 'motion_url');
    assert.equal(call.projectId, 'project-1'); assert.equal(call.assetId, 'hf-motion');
    assert.match(document.body.textContent, /Singing lip sync is not verified/);
  } finally { await view.cleanup(); }
});

test('saved history defaults to approved imagery and allows reviewing a newer variant',async()=>{
 const assets=[{id:'new',image_url:'https://media.test/new.jpg',status:'generated',approved:false},{id:'approved',image_url:'https://media.test/approved.jpg',status:'approved',approved:true}];
 const view=await mount({imageAssets:assets});
 try {
  assert.equal(document.querySelector('img').src,'https://media.test/approved.jpg');
  const select=document.querySelector('[aria-label="Saved image variants"]');assert.equal(select.options.length,2);
  await act(async()=>{select.value='new';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
  assert.equal(document.querySelector('img').src,'https://media.test/new.jpg');
  assert.match(document.body.textContent,/Reject Image/);
  assert.equal(assets[1].approved,true);
 }finally{await view.cleanup()}
});
test('Generate Another Variant requests an append-only idempotent image attempt',async()=>{
 const view=await mount();try {
  await view.click('Generate Another Variant');
  assert.equal(view.rpcCalls[0].name,'enqueue_scene_image_variant');
  assert.equal(view.rpcCalls[0].args.p_project_id,'project-1');
  assert.match(view.rpcCalls[0].args.p_request_id,/^[0-9a-f-]{36}$/);
 }finally{await view.cleanup()}
});

test('final assembly stays disabled if the plan has no approved motion',async()=>{
 const view=await mount({approvedMotionSceneIds:[]});
 try{
   assert.equal(view.button('Assemble Final Video')?.disabled,true);
   assert.match(document.body.textContent,/1 of 1 scenes still need exactly one approved real motion clip/);
   assert.equal(view.rpcCalls.length,0);
 } finally {await view.cleanup();}
});
test('extra approved clips for a scene do not satisfy exactly-one constraint',async()=>{
 const view=await mount({approvedMotionSceneIds:['scene-1','scene-1']});
 try{
   assert.equal(view.button('Assemble Final Video')?.disabled,true);
   assert.equal(view.rpcCalls.length,0);
 } finally {await view.cleanup();}
});
test('approval revoked after initial render is rechecked before enqueue',async()=>{
 const approvedMotionSceneIds=['scene-1'];
 const view=await mount({approvedMotionSceneIds});
 try{
   assert.equal(view.button('Assemble Final Video')?.disabled,false);
   approvedMotionSceneIds.length=0;
   await view.click('Assemble Final Video');
   assert.equal(view.rpcCalls.length,0);
   assert.match(document.body.textContent,/1 of 1 scenes still need exactly one approved real motion clip/);
 } finally {await view.cleanup();}
});


test('production displays approved JSON-like brief content as readable text without rewriting it', async () => {
  const rawScene = {
    id: 'scene-1', scene_number: 1, start_time: 0, end_time: 15.966958333333332,
    title: 'Section 1 (0–15.966958333333332s)', status: 'approved',
    location: '["abandoned warehouse","dimly lit interior"]',
    visual_direction: '["cinematic","high contrast"]',
    camera_direction: '["handheld tracking","slow zoom"]',
    movement_direction: '["rapid cuts","slow movement"]',
    mood: '["dark","defiant"]',
    transition_style: 'Cut to next sequence',
    continuity_notes: '[{"rule":"Keep lighting consistent"},{"rule":"Same wardrobe"}]',
    lyric_moment: 'I used to know the sound of my own hand',
  };
  const original = structuredClone(rawScene);
  const view = await mount({ sceneRecord: rawScene });
  try {
    const detail = document.querySelector('.production-detail');
    assert.equal(detail.querySelector('h2').textContent, 'Section 1');
    assert.match(detail.textContent, /00:00 — 00:15/);
    assert.match(detail.textContent, /abandoned warehouse/);
    assert.match(detail.textContent, /high contrast/);
    assert.match(detail.textContent, /Keep lighting consistent/);
    assert.equal(detail.textContent.includes('15.966958333333332s'), false);
    assert.equal(detail.textContent.includes('["handheld'), false);
    assert.equal(detail.textContent.includes('[{"rule"'), false);
    assert.deepEqual(rawScene, original, 'approved scene data must not be changed');
    assert.equal(view.rpcCalls.length, 0);
    assert.equal(view.calls.length, 0);
  } finally { await view.cleanup(); }
});

test('two failed generation jobs with the same provider error display one labeled alert', async () => {
  const reason = { message: 'PROVIDER_COST_UNVERIFIED: Free execution is unverified.' };
  const view = await mount({
    imageJob: { id: 'failed-image', status: 'failed', error: reason },
    assemblyJob: { id: 'failed-assembly', status: 'failed', error: reason },
  });
  try {
    const alerts = [...document.querySelectorAll('.production-page [role="alert"]')];
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].textContent, /Scene image/);
    assert.match(alerts[0].textContent, /Final assembly/);
    assert.match(alerts[0].textContent, /PROVIDER_COST_UNVERIFIED/);
    assert.equal(view.calls.length, 0);
  } finally { await view.cleanup(); }
});

test('distinct failed job errors remain distinct labeled alerts', async () => {
  const view = await mount({
    imageJob: { id: 'failed-image', status: 'failed', error: {message:'IMAGE_PROVIDER_UNAVAILABLE'} },
    motionJob: { id: 'failed-motion', status: 'failed', error: {message:'MOTION_PROVIDER_UNAVAILABLE'} },
  });
  try {
    const alerts = [...document.querySelectorAll('.production-page [role="alert"]')];
    assert.equal(alerts.length, 2);
    assert.match(alerts[0].textContent, /Scene image: IMAGE_PROVIDER_UNAVAILABLE/);
    assert.match(alerts[1].textContent, /Scene motion: MOTION_PROVIDER_UNAVAILABLE/);
  } finally { await view.cleanup(); }
});

test('status checks reuse freshly signed motion and image URLs instead of restarting video playback', async () => {
  const motionAsset = {
    id: 'approved-ai-clip', scene_id: 'scene-1', generation_job_id: 'completed-ai-job',
    provider: 'huggingface-zerogpu', video_url: 'https://old.example/expired.mp4',
    status: 'approved', approved: true,
  };
  const view = await mount({
    stored: true, motionAssets: [motionAsset],
    motionJob: { id: 'new-queued-attempt', status: 'queued' },
    historicalJob: { id: 'completed-ai-job', status: 'completed', input_snapshot: { hf_motion: { duration_seconds: 2 } } },
  });
  try {
    assert.equal(document.querySelector('video')?.src, 'https://fresh.test/motion.mp4');
    assert.equal(view.calls.filter(call => call.action === 'motion_url').length, 1);
    assert.equal(view.calls.filter(call => call.action === 'image_url').length, 1);
    await view.click('Check Motion Status');
    assert.equal(document.querySelector('video')?.src, 'https://fresh.test/motion.mp4');
    assert.equal(view.calls.filter(call => call.action === 'motion_url').length, 1,
      'poll must not issue a second signature or change the video src');
    assert.equal(view.calls.filter(call => call.action === 'image_url').length, 1,
      'poll must not repeatedly sign the same saved image');
    assert.equal(motionAsset.approved, true, 'no approved media was changed');
  } finally { await view.cleanup(); }
});

test('motion player failure can refresh its cached signature without unapproving the clip', async () => {
  const motionAsset = { id: 'approved-ai-clip', scene_id: 'scene-1', provider: 'huggingface-zerogpu',
    video_url: 'https://old.example/expired.mp4', status: 'approved', approved: true };
  const view = await mount({ motionAssets: [motionAsset] });
  try {
    const player = document.querySelector('video');
    assert.ok(player);
    await act(async () => player.dispatchEvent(new window.Event('error')));
    assert.match(document.body.textContent, /could not be played/);
    await view.click('Retry Motion Playback');
    assert.equal(view.calls.filter(call => call.action === 'motion_url').length, 2);
    assert.equal(motionAsset.approved, true);
  } finally { await view.cleanup(); }
});

test('old complete assembly marked non-downloadable cannot claim a downloadable video', async () => {
  const video_url = 'https://old.example/final.mp4';
  const view = await mount({ assemblyJob: { id: 'finished-assembly', status: 'completed',
    output: { final_video: { video_url, downloadable: false, render_status: 'complete' } } } });
  try {
    assert.equal(view.button('Download Video'), undefined);
    assert.match(document.body.textContent, /marked non-downloadable/);
    assert.match(document.body.textContent, /PLAYBACK UNVERIFIED/);
    const player = [...document.querySelectorAll('video')].find(item => item.src === video_url);
    assert.ok(player);
    await act(async () => player.dispatchEvent(new window.Event('canplay')));
    assert.match(document.body.textContent, /FINAL PREVIEW READY/);
    assert.equal(view.button('Download Video'), undefined, 'browser preview does not override the database export gate');
  } finally { await view.cleanup(); }
});

test('downloadable final media requires successful browser playback before download is offered', async () => {
  const video_url = 'https://new.example/final.mp4';
  const view = await mount({ assemblyJob: { id: 'finished-assembly', status: 'completed',
    output: { final_video: { video_url, downloadable: true, render_status: 'complete' } } } });
  try {
    assert.equal(view.button('Download Video'), undefined);
    const player = [...document.querySelectorAll('video')].find(item => item.src === video_url);
    assert.ok(player);
    await act(async () => player.dispatchEvent(new window.Event('error')));
    assert.match(document.body.textContent, /could not be played/);
    assert.equal(view.button('Download Video'), undefined);
    await act(async () => player.dispatchEvent(new window.Event('canplay')));
    assert.ok(view.button('Download Video'));
  } finally { await view.cleanup(); }
});
