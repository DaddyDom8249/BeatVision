import test from 'node:test';
import assert from 'node:assert/strict';
import {modalFramesForScene, assertModalFrameCount, submitModalMotion, sha256Hex} from '../../supabase/functions/beatvision-generation/modal-motion.ts';
const env = cap => key => ({BRAGORA_MODAL_MAX_FRAMES:cap})[key] || '';

test('long clips are opt-in; select aligned frames from the approved scene duration', () => {
  assert.equal(modalFramesForScene({start_time:0,end_time:5},env('')),49);
  assert.equal(modalFramesForScene({start_time:3,end_time:8},env('161')),121);
  assert.equal(modalFramesForScene({start_time:0,end_time:2.1},env('161')),57);
  assert.equal(modalFramesForScene({start_time:0,end_time:7.8},env('161')),161);
  assert.equal(modalFramesForScene({start_time:0,end_time:1},env('161')),49);
  for(const cap of ['true','160','999','0','1.5'])
    assert.throws(()=>modalFramesForScene({start_time:0,end_time:5},env(cap)),/MODAL_FRAME_LIMIT_INVALID/);
  for(const scene of [{},{start_time:null,end_time:5},{start_time:0,end_time:0},{start_time:5,end_time:2},{start_time:0,end_time:'5'}])
    assert.throws(()=>modalFramesForScene(scene,env('161')),/MODAL_SCENE_DURATION_INVALID/);
});

test('invalid frame counts fail before transport; default is backwards compatible',async()=>{
  assert.equal(assertModalFrameCount(undefined),49);
  for(const n of [49,57,121,161]) assert.equal(assertModalFrameCount(n),n);
  for(const n of [null,true,'121',48,50,169,1,NaN,Infinity])
    assert.throws(()=>assertModalFrameCount(n),/MODAL_FRAME_COUNT_INVALID/);
  let calls=0;
  const credentials=k=>({MODAL_TOKEN_ID:'fixture',MODAL_TOKEN_SECRET:'fixture',BRAGORA_MODAL_GPU_ENABLED:'true',BRAGORA_MODAL_BUDGET_VERIFIED:'true'})[k]||'';
  await assert.rejects(submitModalMotion({frames:169},new Uint8Array(64),credentials,async()=>{calls++;throw Error('no network');}),/MODAL_FRAME_COUNT_INVALID/);
  assert.equal(calls,0);
});


test('operator cap gates extended GPU submission and can stop queued long runs', async () => {
  const image = new Uint8Array(64);
  image.set([137,80,78,71,13,10,26,10]);
  const payload = {project_id:'00000001-0000-4000-8000-000000000001',scene_id:'00000002-0000-4000-8000-000000000002',
    source_image_id:'00000003-0000-4000-8000-000000000003',generation_job_id:'00000004-0000-4000-8000-000000000004',
    prompt:'Move within the approved scene.',seed:42,image_sha256:await sha256Hex(image),frames:121};
  const credentials = cap => k=>({MODAL_TOKEN_ID:'fixture',MODAL_TOKEN_SECRET:'fixture',
    BRAGORA_MODAL_GPU_ENABLED:'true',BRAGORA_MODAL_BUDGET_VERIFIED:'true',BRAGORA_MODAL_MAX_FRAMES:cap})[k]||'';
  const calls=[];
  const request = async (_url, options) => {calls.push(JSON.parse(options.body));return new Response(JSON.stringify({job_id:'fc-fixture'}));};
  for (const cap of ['', '49', '57'])
    await assert.rejects(submitModalMotion(payload,image,credentials(cap),request),/MODAL_DURATION_NOT_ENABLED/);
  assert.equal(calls.length,0);
  await submitModalMotion(payload,image,credentials('161'),request);
  assert.equal(calls.length,1);
  assert.equal(calls[0].payload.frames,121);
});


// Exercise the actual queue controller with an in-memory DB; no provider calls.
import {loadGeneration} from './generation-runtime.mjs';
test('duration is frozen with a distinct idempotency key; existing source snapshots are unchanged', async () => {
  const scene={id:'scene-1',start_time:2,end_time:7};
  const template={status:'completed',vision_lock_id:'lock-1',visual_plan_id:'plan-1',
    input_snapshot:{scene:{...scene},approved_marker:'unchanged'}};
  const before=JSON.stringify(template);
  const writes=[],lookups=[];
  const client={from(table){
    let inserted, key;
    return {select(){return this;},eq(k,v){if(k==='idempotency_key')key=v;return this;},
      order(){return this;},limit(){return this;},insert(data){inserted=data;writes.push(data);return this;},
      async maybeSingle(){
        if(table==='visual_plan_scenes')return {data:{id:scene.id,visual_plan_id:'plan-1',status:'approved'}};
        if(table==='visual_plans')return {data:{id:'plan-1',vision_lock_id:'lock-1',status:'approved'}};
        if(table==='scene_image_assets')return {data:{id:'image-1',storage_path:'private.png',generation_job_id:'image-job'},count:1};
        lookups.push(key);return {data:null};
      },
      async single(){return {data:inserted||template};}
    };
  }};
  for(const cap of ['', '161']) {
    const runtime=await loadGeneration(client,{MODAL_TOKEN_ID:'fixture',MODAL_TOKEN_SECRET:'fixture',
      BRAGORA_MODAL_GPU_ENABLED:'true',BRAGORA_MODAL_BUDGET_VERIFIED:'true',BRAGORA_MODAL_MAX_FRAMES:cap});
    try {await runtime.enqueueHfMotion(client,'project-1',scene.id,true);}
    finally {await runtime.cleanup();}
  }
  assert.equal(writes[0].input_snapshot.modal_motion.frames,49);
  assert.equal(writes[1].input_snapshot.modal_motion.frames,121);
  assert.equal(writes[1].input_snapshot.modal_motion.duration_seconds,121/24);
  assert.equal(writes[1].idempotency_key, writes[0].idempotency_key+':frames:121');
  assert.deepEqual(lookups,writes.map(x=>x.idempotency_key));
  assert.equal(JSON.stringify(template),before);
});

test('completed worker output with wrong frozen frame rate or length cannot reach storage', async () => {
  const video=new Uint8Array(64), source='f'.repeat(64);
  const job={id:'job-1',project_id:'project-1',visual_plan_scene_id:'scene-1',
    input_snapshot:{modal_motion:{source_image_id:'image-1',frames:121}},
    output:{upstream_job_id:'fc-fixture',arena_response:{source_sha256:source}}};
  let manifest={project_id:'project-1',scene_id:'scene-1',generation_job_id:'job-1',
    source_image_id:'image-1',source_sha256:source,video_sha256:await sha256Hex(video),
    model:'Lightricks/LTX-Video-0.9.5',revision:'e58e28c39631af4d1468ee57a853764e11c1d37e',
    creator_approved:false,frames_requested:49,fps_requested:24};
  const originalFetch=globalThis.fetch;
  const runtime=await loadGeneration({}, {MODAL_TOKEN_ID:'fixture',MODAL_TOKEN_SECRET:'fixture'});
  globalThis.fetch=async()=>new Response(JSON.stringify({manifest,video_base64:Buffer.from(video).toString('base64')}));
  try {
    const db={storage:{from(){throw Error('Must reject before storage');}}};
    await assert.rejects(runtime.modalBridgePoll(db,job),/MODAL_PROVENANCE_INVALID/);
    manifest={...manifest,frames_requested:121,fps_requested:25};
    await assert.rejects(runtime.modalBridgePoll(db,job),/MODAL_PROVENANCE_INVALID/);
  } finally {globalThis.fetch=originalFetch;await runtime.cleanup();}
});
