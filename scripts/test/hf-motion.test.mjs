import test from 'node:test';
import assert from 'node:assert/strict';
import { HF_MOTION, hfEligibility, hfSubmit, hfPoll, hfEvent, hfDownload, validateMp4, hfInput } from '../../supabase/functions/beatvision-generation/hf-motion.ts';
import { loadGeneration } from './generation-runtime.mjs';
const params = ['prompt','negative_prompt','input_image_filepath','input_video_filepath','height_ui','width_ui','mode','duration_ui','ui_frames_to_use','seed_ui','randomize_seed','ui_guidance_scale','improve_texture_flag'];
function metadata({ pro=false, owner='DaddyDom8249', stage='RUNNING', revision=HF_MOTION.revision, contract=params, postStatus=200 }={}) {
  const calls=[];
  const request=async(url, init={})=>{
    calls.push({url,init});
    if (url.endsWith('/whoami-v2')) return Response.json({type:'user',name:owner,isPro:pro});
    if (url.includes('/api/spaces/')) return Response.json({sha:revision,host:HF_MOTION.host,runtime:{stage,hardware:{current:'zero-a10g'}}});
    if (url.endsWith('/info')) return Response.json({named_endpoints:{'/image_to_video':{parameters:contract.map(parameter_name=>({parameter_name})),returns:[{component:'Video'}],show_api:true}}});
    return Response.json({event_id:'a'.repeat(32)},{status:postStatus});
  }; return {request,calls};
}
for (const [name, options, code] of [['paid account',{pro:true},'HF_FREE_ACCOUNT_NOT_VERIFIED'],['wrong owner',{owner:'other'},'HF_FREE_ACCOUNT_NOT_VERIFIED'],['runtime changed',{stage:'PAUSED'},'HF_SPACE_ELIGIBILITY_CHANGED'],['source changed',{revision:'other'},'HF_SPACE_ELIGIBILITY_CHANGED'],['contract changed',{contract:[]},'HF_API_CONTRACT_CHANGED']]) test(name+' prevents GPU POST',async()=>{
  const f=metadata(options);await assert.rejects(hfSubmit('test-secret','https://private.test/image.jpg','Character turns head',f.request),new RegExp(code));assert.equal(f.calls.filter(c=>c.init.method==='POST').length,0);
});
test('missing secret fails without any request',async()=>{let called=false;await assert.rejects(hfEligibility('',async()=>{called=true}),/HF_VIDEO_TOKEN_MISSING/);assert.equal(called,false)});
test('real API contract submits once and returns accepted event, never completed',async()=>{
  const f=metadata();const result=await hfSubmit('test-secret','https://private.test/image.jpg','Character turns head',f.request);
  assert.equal(result.status,'processing');assert.equal(result.job_id,'a'.repeat(32));assert.equal(result.eligibility.cost_class,'free');
  const posts=f.calls.filter(c=>c.init.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].url,HF_MOTION.host+'/gradio_api/call/image_to_video');
  const payload=JSON.parse(posts[0].init.body).data;assert.equal(payload[2].meta._type,'gradio.FileData');assert.equal(payload[7],2);assert.equal(payload[6],'image-to-video');assert.equal(JSON.stringify(result).includes('test-secret'),false);
});
test('quota rejection does not retry or fall back',async()=>{const f=metadata({postStatus:429});await assert.rejects(hfSubmit('test-secret','https://private.test/image.jpg','move',f.request),/HF_QUOTA_EXHAUSTED/);assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1)});
test('ambiguous POST is not retried',async()=>{const f=metadata();let posts=0;const request=async(u,i)=>{if(i?.method==='POST'){posts++;throw new TypeError('network')}return f.request(u,i)};await assert.rejects(hfSubmit('test-secret','https://private.test/image.jpg','move',request),/HF_SUBMISSION_ACCEPTANCE_UNKNOWN/);assert.equal(posts,1)});
test('SSE heartbeat never completes; error wins and external output is rejected',()=>{
  assert.equal(hfEvent('event: heartbeat\ndata: null'),null);
  assert.throws(()=>hfEvent('event: error\ndata: "GPU quota exceeded"'),/HF_QUOTA_EXHAUSTED/);
  assert.throws(()=>hfEvent('event: complete\ndata: [{"video":{"url":"https://evil.test/video.mp4"}}]'),/HF_OUTPUT_HOST_REJECTED/);
  assert.throws(()=>hfEvent('event: complete\ndata: [null]'),/HF_OUTPUT_MISSING/);
});
test('SSE split across network chunks produces the real file output',async()=>{
  const complete='event: heartbeat\ndata: null\n\nevent: complete\ndata: '+JSON.stringify([{video:{url:HF_MOTION.host+'/gradio_api/file=/tmp/video.mp4'}},42])+'\n\n';
  const encoder=new TextEncoder();const request=async()=>new Response(new ReadableStream({start(c){c.enqueue(encoder.encode(complete.slice(0,57)));c.enqueue(encoder.encode(complete.slice(57)));c.close()}}));
  const result=await hfPoll('test-secret','a'.repeat(32),request);assert.equal(result.status,'completed');assert.equal(result.result.seed,42);assert.equal(result.result.generation_type,'GENERATIVE_VIDEO');
});
test('completed HTTP without SSE completion stays processing',async()=>{assert.equal((await hfPoll('test-secret','a'.repeat(32),async()=>new Response('event: heartbeat\ndata: null\n\n'))).status,'processing')});
function box(type, payload=Buffer.alloc(0)){const b=Buffer.alloc(8);b.writeUInt32BE(8+payload.length);b.write(type,4);return Buffer.concat([b,payload])}
function container(samples=2){const h=Buffer.alloc(12);h.write('vide',8);const sizes=Buffer.alloc(12);sizes.writeUInt32BE(samples,8);const desc=Buffer.alloc(16);desc.write('avc1',12);const duration=Buffer.alloc(20);duration.writeUInt32BE(30,12);duration.writeUInt32BE(60,16);return Buffer.concat([box('ftyp',Buffer.from('isom0000')),box('moov',box('trak',box('mdia',Buffer.concat([box('hdlr',h),box('mdhd',duration),box('minf',box('stbl',Buffer.concat([box('stsd',desc),box('stsz',sizes)])))])))),box('mdat',Buffer.alloc(1200))])}
test('MP4 validator rejects HTML, truncation and a still-frame container',()=>{assert.throws(()=>validateMp4(Buffer.from('<html>failure</html>')),/HF_VIDEO_EMPTY/);assert.throws(()=>validateMp4(container().subarray(0,1100)),/HF_MP4_INVALID/);assert.throws(()=>validateMp4(container(1)),/HF_MP4_VIDEO_SAMPLES_MISSING/);assert.equal(validateMp4(container()).subject_motion_verified,false);assert.equal(validateMp4(container()).measured_duration_seconds,2);assert.equal(validateMp4(container()).duration_source,'mp4_video_track_mdhd')});
test('video download validates real bytes and never follows another host',async()=>{const b=container();const r=await hfDownload(HF_MOTION.host+'/gradio_api/file=/tmp/video.mp4','test-secret',async(u,i)=>{assert.equal(i.redirect,'error');return new Response(b)});assert.equal(r.verification.video_samples,2);await assert.rejects(hfDownload('https://evil.test/video.mp4','test-secret',async()=>{throw Error('should not fetch')}),/HF_OUTPUT_HOST_REJECTED/)});
test('legacy new-motion run fails before any paid provider request', async () => {
  let requested = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => { requested++; throw Error('must not fetch'); };
  let current = { id: 'job-1', job_type: 'scene_motion', status: 'queued', input_snapshot: {} };
  const client = { from() { return {
    update(row) { current = { ...current, ...row }; return this; },
    eq() { return this; }, in() { return this; }, select() { return this; },
    single: async () => ({ data: current }), maybeSingle: async () => ({ data: current }),
    then(resolve) { return Promise.resolve({ data: [{ id: current.id }] }).then(resolve); },
  }; } };
  const runtime = await loadGeneration(client);
  try {
    const job = await runtime.run(client, current);
    assert.equal(job.status, 'failed'); assert.equal(requested, 0);
    assert.match(job.error.message, /HF_FREE_MOTION_REQUIRED/);
  } finally { globalThis.fetch = original; await runtime.cleanup(); }
});
for (const action of ['enqueue_ai_motion','motion_url','motion_eligibility']) test(action+' enforces project ownership before HF access',async()=>{
  let requests=0;const original=globalThis.fetch;globalThis.fetch=async()=>{requests++;throw Error('must not fetch')};
  const client={auth:{getUser:async()=>({data:{user:{id:'other-user'}}})},from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:'project-1',owner_id:'owner-1'}})}}};
  const runtime=await loadGeneration(client);
  try{const response=await runtime.handler(new Request('https://test/function',{method:'POST',headers:{Authorization:'Bearer test-session'},body:JSON.stringify({action,projectId:'project-1',sceneId:'scene-1',acceptedTerms:true})}));assert.equal(response.status,404);assert.equal(requests,0)}finally{globalThis.fetch=original;await runtime.cleanup()}
});
test('model terms must be accepted before eligibility or any job write',async()=>{const runtime=await loadGeneration();try{await assert.rejects(runtime.enqueueHfMotion({},'project-1','scene-1',false),/Accept the LTX/)}finally{await runtime.cleanup()}});

test('HF completion stores immutable private video and pins the generating image', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => url.includes('/call/')
    ? new Response('event: complete\ndata: '+JSON.stringify([{video:{url:HF_MOTION.host+'/gradio_api/file=/tmp/real.mp4'}},42])+'\n\n')
    : new Response(container());
  let uploaded, inserted; const imageFilters = {};
  const client = {
    storage: { from(bucket) { assert.equal(bucket,'visual-assets'); return {
      download: async()=>({error:{message:'not found'}}),
      upload: async(path,bytes,options)=>{ uploaded={path,bytes,options};return {data:{path}} },
      createSignedUrl: async(path)=>({data:{signedUrl:'https://private.test/'+path}}),
    }; } },
    from(table) { return {
      select(){return this},eq(k,v){if(table==='scene_image_assets')imageFilters[k]=v;return this},order(){return this},limit(){return this},
      maybeSingle:async()=>({data:table==='scene_image_assets'?{id:'source-approved'}:null}),
      insert(row){inserted=row;return this},single:async()=>({data:inserted}),
    }; },
  };
  const runtime=await loadGeneration(client); globalThis.Deno.env.get=()=> 'test-secret';
  const job={id:'job-1',project_id:'project-1',visual_plan_id:'plan-1',visual_plan_scene_id:'scene-1',job_type:'scene_motion',created_at:new Date().toISOString(),input_snapshot:{hf_motion:{source_image_id:'source-approved'}},output:{upstream_job_id:'a'.repeat(32)}};
  try {
    const response=await runtime.hfBridgePoll(client,job);
    assert.equal(response.data.status,'completed');assert.equal(uploaded.options.upsert,false);assert.equal(uploaded.options.contentType,'video/mp4');
    assert.equal(uploaded.path,'project-1/scene-motion/plan-1/scene-1/job-1.mp4');assert.equal(response.data.result.verification.video_samples,2);
    await runtime.persistMotionClip(client,job,response.data);
    assert.equal(imageFilters.id,'source-approved');assert.equal(imageFilters.project_id,'project-1');assert.equal(inserted.scene_image_id,'source-approved');assert.equal(inserted.approved,false);assert.equal(inserted.provider,'huggingface-zerogpu');
  } finally { globalThis.fetch=original;await runtime.cleanup(); }
});

for (const approvedPlan of [true,false]) test('HF enqueue '+(approvedPlan?'reuses immutable attempt without writes':'rejects an unapproved plan before a job write'),async()=>{
  const f=metadata();const original=globalThis.fetch;globalThis.fetch=f.request;let writes=0;const filters=[];
  const existing={id:'already-enqueued',status:'completed'};
  const client={from(table){const where={};filters.push({table,where});return{
    select(){return this},eq(k,v){where[k]=v;return this},order(){return this},limit(){return this},insert(){writes++;throw Error('must not insert')},
    async maybeSingle(){return{data:table==='visual_plan_scenes'?{id:'scene-1',visual_plan_id:'plan-1'}:table==='visual_plans'?(approvedPlan?{vision_lock_id:'lock-1'}:null):table==='scene_image_assets'?{id:'image-1',storage_path:'project-1/image.jpg',generation_job_id:'image-job'}:existing}},
    async single(){return{data:{id:'image-job',project_id:'project-1',status:'completed',vision_lock_id:'lock-1',visual_plan_id:'plan-1',input_snapshot:{scene:{id:'scene-1'}}}}},
  }}};
  const runtime=await loadGeneration(client);globalThis.Deno.env.get=()=> 'test-secret';
  try {
    if(approvedPlan){assert.deepEqual(await runtime.enqueueHfMotion(client,'project-1','scene-1',true),existing);assert.equal(filters.find(x=>x.table==='scene_image_assets').where.approved,true)}
    else await assert.rejects(runtime.enqueueHfMotion(client,'project-1','scene-1',true),/approved locked Visual Plan/);
    assert.equal(writes,0);assert.equal(f.calls.filter(c=>c.init.method==='POST').length,0);
  }finally{globalThis.fetch=original;await runtime.cleanup()}
});

test('LTX MP4 validator reads the media track as 1.90 seconds, not the two-second request',()=>{
  const bytes=Buffer.from(container());
  const atom=bytes.indexOf(Buffer.from('mdhd'));
  assert.ok(atom>0);
  // mdhd.start follows the four-character box tag; duration starts 16 bytes later.
  bytes.writeUInt32BE(57,atom+20);
  const media=validateMp4(bytes);
  assert.equal(media.measured_duration_seconds,1.9);
  assert.equal(media.video_samples,2);
  assert.equal(media.subject_motion_verified,false);
});
test('MP4 validator rejects missing timescale before trusting duration',()=>{
  const bytes=Buffer.from(container());
  const atom=bytes.indexOf(Buffer.from('mdhd'));
  bytes.writeUInt32BE(0,atom+16);
  assert.throws(()=>validateMp4(bytes),/HF_MP4_DURATION_MISSING/);
});
