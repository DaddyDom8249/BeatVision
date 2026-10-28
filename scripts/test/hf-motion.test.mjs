import test from 'node:test';
import assert from 'node:assert/strict';
import { HF_MOTION, hfEligibility, hfSubmit, hfPoll, hfEvent, hfDownload, validateMp4, hfInput, hfJobSeed } from '../../supabase/functions/beatvision-generation/hf-motion.ts';
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
  const f=metadata(options);await assert.rejects(hfSubmit('test-secret','https://private.test/image.jpg','Character turns head',42,f.request),new RegExp(code));assert.equal(f.calls.filter(c=>c.init.method==='POST').length,0);
});
test('missing secret fails without any request',async()=>{let called=false;await assert.rejects(hfEligibility('',async()=>{called=true}),/HF_VIDEO_TOKEN_MISSING/);assert.equal(called,false)});
test('real API contract submits once and returns accepted event, never completed',async()=>{
  const f=metadata();const result=await hfSubmit('test-secret','https://private.test/image.jpg','Character turns head',42,f.request);
  assert.equal(result.status,'processing');assert.equal(result.job_id,'a'.repeat(32));assert.equal(result.eligibility.cost_class,'free');
  const posts=f.calls.filter(c=>c.init.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].url,HF_MOTION.host+'/gradio_api/call/image_to_video');
  const payload=JSON.parse(posts[0].init.body).data;assert.equal(payload[2].meta._type,'gradio.FileData');assert.equal(payload[7],2);assert.equal(payload[6],'image-to-video');assert.equal(JSON.stringify(result).includes('test-secret'),false);
});
test('quota rejection does not retry or fall back',async()=>{const f=metadata({postStatus:429});await assert.rejects(hfSubmit('test-secret','https://private.test/image.jpg','move',42,f.request),/HF_QUOTA_EXHAUSTED/);assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1)});
test('ambiguous POST is not retried',async()=>{const f=metadata();let posts=0;const request=async(u,i)=>{if(i?.method==='POST'){posts++;throw new TypeError('network')}return f.request(u,i)};await assert.rejects(hfSubmit('test-secret','https://private.test/image.jpg','move',42,request),/HF_SUBMISSION_ACCEPTANCE_UNKNOWN/);assert.equal(posts,1)});
test('SSE heartbeat never completes; error wins and external output is rejected',()=>{
  assert.equal(hfEvent('event: heartbeat\ndata: null'),null);
  assert.throws(()=>hfEvent('event: error\ndata: "GPU quota exceeded"'),/HF_QUOTA_EXHAUSTED/);
  assert.throws(()=>hfEvent('event: complete\ndata: [{"video":{"url":"https://evil.test/video.mp4"}}]'),/HF_OUTPUT_HOST_REJECTED/);
  assert.throws(()=>hfEvent('event: complete\ndata: [null]'),/HF_OUTPUT_MISSING/);
});
test('provider SSE failures are safely classified without exposing raw errors', () => {
  const cases = [
    ['GPU quota exceeded', 'HF_QUOTA_EXHAUSTED'],
    ['ZeroGPU daily quota used up', 'HF_QUOTA_EXHAUSTED'],
    ['CUDA error: out of memory', 'HF_CAPACITY_UNAVAILABLE'],
    ['GPU temporarily unavailable', 'HF_CAPACITY_UNAVAILABLE'],
    ['Unexpected image generation exception: private.example/token/secret', 'HF_GENERATION_FAILED'],
  ];
  for (const [detail, code] of cases) {
    let thrown;
    try { hfEvent('event: error\ndata: ' + JSON.stringify(detail)); }
    catch (error) { thrown = error; }
    assert.equal(thrown?.code, code);
    assert.equal(thrown?.message, code);
    assert.doesNotMatch(thrown?.message, /private\.example/);
  }
});
test('typed Hugging Face terminal errors persist a distinct error code', async () => {
  const previous = globalThis.fetch;
  let update = null;
  const db = { from(table) {
    assert.equal(table, 'generation_jobs');
    return {
      update(value) { update = value; return this; },
      eq() { return this; }, in() { return this; }, select() { return this; },
      then(resolve) { return Promise.resolve({ data: [{ id: 'job-1' }], error: null }).then(resolve); },
    };
  } };
  const runtime = await loadGeneration(db);
  try {
    for (const code of ['HF_GENERATION_FAILED', 'HF_CAPACITY_UNAVAILABLE', 'HF_QUOTA_EXHAUSTED']) {
      await runtime.setFailed(db, 'job-1', code);
      assert.equal(update?.error?.code, code);
      assert.equal(update?.status, 'failed');
    }
    await runtime.setFailed(db, 'job-1', 'HF_SOME_UNKNOWN_REMOTE_ERROR');
    assert.equal(update?.error?.code, 'ARENA_GENERATION_FAILED');
  } finally { globalThis.fetch = previous; await runtime.cleanup(); }
});
const motionEventId = 'a'.repeat(32);
const queueEvent = (value) => 'data: ' + JSON.stringify(value) + '\n\n';
const queueComplete = (output, success = true, eventId = motionEventId) => queueEvent({
  msg: 'process_completed', event_id: eventId, success, output,
});
test('structured polling reads the accepted event without submitting another job', async () => {
  const calls = [];
  const submitted = metadata();
  const request = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.includes('/queue/data')) return new Response(queueComplete({ data: [
      { video: { url: HF_MOTION.host + '/gradio_api/file=/tmp/video.mp4' } }, 42,
    ] }));
    return submitted.request(url, init);
  };
  const accepted = await hfSubmit('test-secret', 'https://private.test/image.jpg', 'Subject moves', 42, request);
  const result = await hfPoll('test-secret', accepted.job_id, request);
  assert.equal(result.status, 'completed');
  assert.equal(calls.filter(call => call.init.method === 'POST').length, 1);
  const polling = calls.at(-1);
  assert.equal(polling.url, HF_MOTION.host + '/gradio_api/queue/data?session_hash=' + accepted.job_id);
  assert.equal(polling.init.method ?? 'GET', 'GET');
  assert.equal(polling.init.headers.Authorization, 'Bearer test-secret');
  assert.equal(polling.init.redirect, 'error');
});
test('structured SSE split across network chunks produces the real file output',async()=>{
  const complete=queueEvent({msg:'heartbeat'})+queueComplete({data:[{video:{url:HF_MOTION.host+'/gradio_api/file=/tmp/video.mp4'}},42]});
  const encoder=new TextEncoder();const request=async()=>new Response(new ReadableStream({start(c){c.enqueue(encoder.encode(complete.slice(0,57)));c.enqueue(encoder.encode(complete.slice(57)));c.close()}}));
  const result=await hfPoll('test-secret','a'.repeat(32),request);assert.equal(result.status,'completed');assert.equal(result.result.seed,42);assert.equal(result.result.generation_type,'GENERATIVE_VIDEO');
});
test('structured heartbeat and status messages stay processing',async()=>{
  const stream=queueEvent({msg:'heartbeat'})+queueEvent({msg:'estimation',event_id:motionEventId,rank:0})+queueEvent({msg:'process_starts',event_id:motionEventId});
  assert.equal((await hfPoll('test-secret',motionEventId,async()=>new Response(stream))).status,'processing');
});
test('structured failures preserve safe quota and capacity categories without raw provider details', async () => {
  for (const [error, code] of [
    ['You have exceeded your GPU quota. Try again later.', 'HF_QUOTA_EXHAUSTED'],
    ['CUDA error: out of memory', 'HF_CAPACITY_UNAVAILABLE'],
    ['GPU temporarily unavailable', 'HF_CAPACITY_UNAVAILABLE'],
    ['Could not load image https://private.example/secret-token', 'HF_GENERATION_FAILED'],
  ]) {
    await assert.rejects(hfPoll('test-secret', motionEventId,
      async () => new Response(queueComplete({ error }, false))), failure => {
      assert.equal(failure.code, code);
      assert.equal(failure.message, code);
      assert.doesNotMatch(failure.message, /private\.example|secret-token/);
      return true;
    });
  }
});
test('structured terminal messages without usable data or error fail generically', async () => {
  for (const [output, success] of [[{error:null},false],[{},false],[{},true],[{data:[]},true]]) {
    await assert.rejects(hfPoll('test-secret',motionEventId,
      async()=>new Response(queueComplete(output,success))), /HF_GENERATION_FAILED/);
  }
});
test('structured terminal messages must match the accepted event exactly', async () => {
  const data=[{video:{url:HF_MOTION.host+'/gradio_api/file=/tmp/other.mp4'}},91];
  const stream=queueComplete({data},true,'b'.repeat(32))+queueComplete({error:'GPU quota exceeded'},false,'b'.repeat(32))
    +queueEvent({msg:'process_completed',success:true,output:{data}});
  assert.equal((await hfPoll('test-secret',motionEventId,async()=>new Response(stream))).status,'processing');
});
test('malformed structured events cannot complete a job', async () => {
  await assert.rejects(hfPoll('test-secret',motionEventId,async()=>new Response('data: {"msg":\n\n')), /HF_OUTPUT_INVALID/);
});
function box(type, payload=Buffer.alloc(0)){const b=Buffer.alloc(8);b.writeUInt32BE(8+payload.length);b.write(type,4);return Buffer.concat([b,payload])}
function container(samples=2){const h=Buffer.alloc(12);h.write('vide',8);const sizes=Buffer.alloc(12);sizes.writeUInt32BE(samples,8);const desc=Buffer.alloc(16);desc.write('avc1',12);const duration=Buffer.alloc(20);duration.writeUInt32BE(30,12);duration.writeUInt32BE(60,16);return Buffer.concat([box('ftyp',Buffer.from('isom0000')),box('moov',box('trak',box('mdia',Buffer.concat([box('hdlr',h),box('mdhd',duration),box('minf',box('stbl',Buffer.concat([box('stsd',desc),box('stsz',sizes)])))])))),box('mdat',Buffer.alloc(1200))])}
test('MP4 validator rejects HTML, truncation and a still-frame container',()=>{assert.throws(()=>validateMp4(Buffer.from('<html>failure</html>')),/HF_VIDEO_EMPTY/);assert.throws(()=>validateMp4(container().subarray(0,1100)),/HF_MP4_INVALID/);assert.throws(()=>validateMp4(container(1)),/HF_MP4_VIDEO_SAMPLES_MISSING/);assert.equal(validateMp4(container()).subject_motion_verified,false)});
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

test('omitted motion provider uses the Modal budget guard; explicit HF keeps its eligibility guard', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Unexpected provider access'); };
  const client = {auth: {getUser: async () => ({data: {user: {id: 'owner-1'}}})}, from(table) {
    assert.equal(table, 'projects');
    return {select() { return this; }, eq() { return this; }, maybeSingle: async () => ({data: {id: 'project-1', owner_id: 'owner-1'}})};
  }};
  const runtime = await loadGeneration(client, {}, process.env.BRAGORA_GENERATION_CONTROLLER_FIXTURE);
  try {
    for (const [provider, code] of [[undefined, 'MODAL_GPU_UNAVAILABLE'], ['huggingface', 'HF_VIDEO_TOKEN_MISSING'], ['other', 'MOTION_PROVIDER_INVALID']]) {
      const response = await runtime.handler(new Request('https://test/function', {method: 'POST', headers: {Authorization: 'Bearer fixture-session'},
        body: JSON.stringify({action: 'enqueue_ai_motion', projectId: 'project-1', sceneId: 'scene-1', acceptedTerms: true, provider})}));
      const data = await response.json();
      if (provider === 'huggingface') assert.match(data.error.message, /HF_VIDEO_TOKEN_MISSING/);
      else assert.equal(data.error.code, code);
    }
    assert.equal(requests, 0, 'no GPU/provider request is authorized by a default or missing configuration');
    await assert.rejects(runtime.enqueueHfMotion({}, 'project-1', 'scene-1', true), /Modal worker or spending safeguard/);
  } finally { globalThis.fetch = original; await runtime.cleanup(); }
});

test('HF completion stores immutable private video and pins the generating image', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => url.includes('/queue/data')
    ? new Response(queueComplete({data:[{video:{url:HF_MOTION.host+'/gradio_api/file=/tmp/real.mp4'}},42]}))
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
    async single(){return{data:{id:'image-job',project_id:'project-1',status:'completed',vision_lock_id:'lock-1',visual_plan_id:'plan-1',input_snapshot:{scene:{id:'scene-1',movement_direction:{actor:'The approved figure lifts one hand into view.',camera:'Camera remains still.'}}}}}},
  }}};
  const runtime=await loadGeneration(client);globalThis.Deno.env.get=()=> 'test-secret';
  try {
    if(approvedPlan){assert.deepEqual(await runtime.enqueueHfMotion(client,'project-1','scene-1',true,undefined,undefined,'huggingface'),existing);assert.equal(filters.find(x=>x.table==='scene_image_assets').where.approved,true)}
    else await assert.rejects(runtime.enqueueHfMotion(client,'project-1','scene-1',true,undefined,undefined,'huggingface'),/approved locked Visual Plan/);
    assert.equal(writes,0);assert.equal(f.calls.filter(c=>c.init.method==='POST').length,0);
  }finally{globalThis.fetch=original;await runtime.cleanup()}
});

test('scene image dispatch uses authenticated Arena bridge, never Pixazo directly',async()=>{
  const originalFetch=globalThis.fetch, calls=[];
  let job={id:'scene-image-fixture',job_type:'scene_image',status:'queued',project_id:'project-1',
    visual_plan_id:'plan-1',visual_plan_scene_id:'scene-1',attempts:0,output:{},input_snapshot:{
      plan:{duration_seconds:8},scene:{id:'scene-1',scene_number:1,start_time:0,end_time:8},
      vision_snapshot:{song:{id:'song-1',title:'Test song',artist:'Test artist',
        analysis:{duration_seconds:8,analysis_method:'browser_audio_decode'}},world:{id:'world-1'},
        style_bible:{id:'style-1'},revision_number:1}
    }};
  const db={from(table){
    assert.equal(table,'generation_jobs');
    let change={};
    const apply=()=>{job={...job,...change};return job;};
    return {update(x){change=x;return this},select(){return this},eq(){return this},in(){return this},
      async maybeSingle(){return{data:apply(),error:null}},
      async single(){return{data:apply(),error:null}},
      then(resolve){apply();return Promise.resolve({data:[{id:job.id}],error:null}).then(resolve)}};
  }};
  globalThis.fetch=async(url,init)=>{
    calls.push({url:String(url),init});
    return Response.json({ok:false,status:'provider_unavailable',code:'PROVIDER_COST_UNVERIFIED',
      error:'Workers Free entitlement or AI binding not available'}, {status:503});
  };
  const runtime=await loadGeneration(db,{ARENA_GATEWAY_URL:'https://arena.fixture.workers.dev',ARENA_GATEWAY_ALLOWED_HOSTS:'arena.fixture.workers.dev',ARENA_GATEWAY_TOKEN:'fixture-secret'});
  try {
    const result=await runtime.run(db,job);
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://arena.fixture.workers.dev/v2/scene-image');
    const payload=JSON.parse(calls[0].init.body).payload;
    assert.equal(payload.source.application,'beatvision');
    assert.equal(payload.source.contract,'2.0');
    assert.equal(payload.generation.model,'flux-schnell');
    assert.equal(payload.generation.cost_class,'free');
    assert.equal(result.status,'failed','an unavailable free provider must never fabricate an image');
    assert.equal(result.error.code,'PROVIDER_COST_UNVERIFIED');
    assert.equal(result.error.message,'PROVIDER_COST_UNVERIFIED');
    assert.equal(result.error.detail.http_status,503);
  } finally {globalThis.fetch=originalFetch;await runtime.cleanup()}
});

test('image completion rejects any provider outside pinned Cloudflare Free FLUX path',async()=>{
  const runtime=await loadGeneration();
  const valid={
    ok:true,bridge:{contract_version:'2.0',cost_class:'free',source_of_truth:'beatvision',
      generation_model:'flux-schnell'},
    result:{free_only:true,provider_path:['cloudflare-workers-ai'],
      images:[{provider:'cloudflare-workers-ai',model:'flux-1-schnell',image_base64:'ZmFrZQ=='}]}
  };
  try {
    assert.doesNotThrow(()=>runtime.assertVerifiedFreeSceneImageResponse(valid));
    const cases=[
      {result:{...valid.result,provider_path:['pixazo']}},
      {result:{...valid.result,provider_path:['cloudflare-workers-ai','pixazo']}},
      {result:{...valid.result,free_only:false}},
      {result:{...valid.result,images:[{provider:'pixazo',model:'flux-1-schnell',image_base64:'ZmFrZQ=='}]}},
      {result:{...valid.result,images:[{provider:'cloudflare-workers-ai',model:'sdxl',image_base64:'ZmFrZQ=='}]}},
      {result:{...valid.result,images:[{provider:'cloudflare-workers-ai',model:'flux-1-schnell',image_url:'https://pixazo.test/image.png'}]}},
      {bridge:{...valid.bridge,cost_class:'unknown'}},
      {bridge:{...valid.bridge,source_of_truth:'external'}},
      {bridge:{...valid.bridge,contract_version:'1.1'}},
    ];
    for(const mismatch of cases){
      assert.throws(()=>runtime.assertVerifiedFreeSceneImageResponse({...valid,...mismatch}),/FREE_IMAGE_PROVIDER_MISMATCH/);
    }
  } finally {await runtime.cleanup()}
});

test('stale provider work fails from acceptance age despite recent poll timestamp',async()=>{
 let job={id:'stale-job',job_type:'assembly',status:'processing',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),output:{upstream_job_id:'existing',dispatch_started_at:new Date(Date.now()-31*60*1000).toISOString()}};let calls=0;
 const db={from(){return {select(){return this},eq(){return this},in(){return this},update(row){job={...job,...row};return this},async single(){return{data:job}},then(resolve){return Promise.resolve({data:[{id:job.id}]}).then(resolve)}}}};
 const original=globalThis.fetch;const runtime=await loadGeneration(db);globalThis.fetch=async()=>{calls++;throw Error('unexpected network')};
 try{const result=await runtime.poll(db,job);assert.equal(result.status,'failed');assert.equal(result.error.code,'PROVIDER_TIMEOUT');assert.equal(calls,0)}finally{globalThis.fetch=original;await runtime.cleanup()}
});

test('free motion claim never PATCHes nonexistent generation_jobs.model', async () => {
  const updates = [];
  const db = { from(table) {
    assert.equal(table, 'generation_jobs');
    return { update(record) { updates.push(record); throw Error('STOP_BEFORE_WRITE'); } };
  } };
  const runtime = await loadGeneration();
  try {
    await assert.rejects(runtime.run(db, { id: 'job-queued', job_type: 'scene_motion', status: 'queued',
      input_snapshot: { hf_motion: { revision: HF_MOTION.revision } }, output: {}, attempts: 0 }), /STOP_BEFORE_WRITE/);
    assert.equal(updates.length, 1);
    assert.equal(Object.hasOwn(updates[0], 'model'), false);
    assert.equal(updates[0].provider, 'huggingface-zerogpu');
    assert.equal(updates[0].provider_job_id, 'beatvision:job-queued');
    assert.equal(updates[0].status, 'submitted');
  } finally { await runtime.cleanup(); }
});

test('unique immutable job IDs provide distinct deterministic motion seeds', () => {
  const first = '40042432-b17b-49c6-a357-c102ee1c475a';
  const second = '9ab6559a-0a4d-4c5a-8f3a-b8e0b49449ed';
  const a = hfJobSeed(first), b = hfJobSeed(second);
  assert.ok(a >= 1 && a <= 2147483646);
  assert.ok(b >= 1 && b <= 2147483646);
  assert.notEqual(a, b, 'different append-only variants must not reuse seed 42');
  assert.equal(hfJobSeed(first), a, 'same job retry must retain seed');
  const imageUrl = 'https://private.test/scene.jpg';
  assert.equal(hfInput(imageUrl, 'Actor walks', a)[9], a);
  assert.equal(hfInput(imageUrl, 'Actor walks', b)[9], b);
  assert.equal(hfInput(imageUrl, 'Actor walks', a)[10], false, 'server controls seed for retries');
  assert.throws(() => hfJobSeed('not-a-job-uuid'), /HF_JOB_ID_INVALID/);
  assert.throws(() => hfInput(imageUrl, 'Actor walks', 0), /HF_SEED_INVALID/);
  assert.throws(() => hfInput(imageUrl, 'Actor walks', undefined), /HF_SEED_INVALID/);
});

test('verified free provider POST receives only caller-requested job seed', async () => {
  const f = metadata();
  const seed = hfJobSeed('9ab6559a-0a4d-4c5a-8f3a-b8e0b49449ed');
  const result = await hfSubmit('test-secret', 'https://private.test/approved-scene.jpg', 'Subject moves', seed, f.request);
  assert.equal(result.result.requested_seed, seed);
  assert.equal(result.eligibility.cost_class, 'free');
  const posts = f.calls.filter(c => c.init.method === 'POST');
  assert.equal(posts.length, 1);
  const data = JSON.parse(posts[0].init.body).data;
  assert.equal(data[9], seed);
  assert.equal(data[10], false);
  assert.equal(data[2].url, 'https://private.test/approved-scene.jpg');
  assert.equal(JSON.stringify(posts[0]).includes('test-secret'), true, 'request is authenticated');
});

test('invalid motion seed fails before provider eligibility or paid resource request', async () => {
  let calls = 0;
  await assert.rejects(
    hfSubmit('test-secret', 'https://private.test/scene.jpg', 'Actor walks', NaN, async () => {
      calls++; throw Error('network must not be called');
    }), /HF_SEED_INVALID/
  );
  assert.equal(calls, 0);
});

test('free Shotstack sandbox assembly passes controller cost guard without opening paid routes', async () => {
  const calls = [];
  const snapshot = {
    plan: { title: 'Frozen visual plan', duration_seconds: 8 },
    vision_snapshot: {
      song: { id: 'song-1', title: 'Test', artist: 'Test', analysis: { duration_seconds: 8, analysis_method: 'browser_audio_decode' } },
      world: { id: 'world-1' }, style_bible: { id: 'style-1' }, revision_number: 1,
    },
    scenes: [{ id: 'scene-1', scene_number: 1, start_time: 0, end_time: 8 }],
    motion_clips: [{ scene: 1, asset_id: 'approved-clip-1', video_url: 'https://existing.example.test/clip.mp4' }],
    audio_path: 'song-1/audio.wav',
  };
  let job = { id: 'assembly-test-job', project_id: 'project-1', visual_plan_id: 'plan-1',
    vision_lock_id: 'lock-1', job_type: 'assembly', status: 'queued',
    attempts: 0, input_snapshot: snapshot, output: {} };
  const db = {
    storage: { from(bucket) {
      assert.ok(['songs','visual-assets'].includes(bucket));
      return { createSignedUrl: async () => ({ data: { signedUrl: 'https://private.example.test/'+bucket }, error: null }) };
    } },
    from(table) {
      if (table === 'motion_clip_assets') return {
        select() { return this; }, eq() { return this; }, in() { return this; },
        then(resolve) { return Promise.resolve({data:[{id:'approved-clip-1',project_id:'project-1',visual_plan_id:'plan-1',scene_id:'scene-1',generation_job_id:'motion-job',approved:true,status:'approved'}]}).then(resolve); },
      };
      assert.equal(table, 'generation_jobs');
      let changes = null;
      let lookupIds = null;
      const apply = () => { if (changes) job = { ...job, ...changes }; return job; };
      return {
        update(next) { changes = next; return this; },
        select() { return this; }, eq() { return this; }, in(k,v) { lookupIds=v; return this; },
        async maybeSingle() { return { data: apply(), error: null }; },
        async single() { return { data: apply(), error: null }; },
        then(resolve) {
          if (lookupIds?.includes('motion-job')) return Promise.resolve({data:[{id:'motion-job',project_id:'project-1',visual_plan_id:'plan-1',visual_plan_scene_id:'scene-1',job_type:'scene_motion',status:'completed',output:{arena_status_response:{result:{storage_path:'project-1/scene-motion/plan-1/scene-1/motion-job.mp4',verification:{container_verified:true,video_duration_seconds:8}}}}}]}).then(resolve);
          apply(); return Promise.resolve({ data: [{ id: job.id }], error: null }).then(resolve);
        },
      };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ ok: false, status: 'provider_unavailable', error: 'Sandbox stage unavailable in fixture' }, { status: 503 });
  };
  const runtime = await loadGeneration(db, { ARENA_GATEWAY_URL: 'https://arena.fixture.workers.dev', ARENA_GATEWAY_ALLOWED_HOSTS: 'arena.fixture.workers.dev', ARENA_GATEWAY_TOKEN: 'fixture-secret' });
  try {
    const result = await runtime.run(db, job);
    assert.equal(calls.length, 1, 'one gateway request only; no Pixazo, production Shotstack, or second attempt');
    assert.equal(calls[0].url, 'https://arena.fixture.workers.dev/v2/assemble');
    assert.equal(calls[0].init.method, 'POST');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.payload.generation.cost_class, 'free');
    assert.equal(body.payload.generation.model, null, 'assembly does not request a paid AI model');
    assert.equal(body.payload.motion.clips.length, 1);
    assert.equal(result.status, 'failed', 'provider failure must not be passed off as a completed video');
    assert.match(result.error.message, /Sandbox stage unavailable/);
  } finally { globalThis.fetch = originalFetch; await runtime.cleanup(); }
});
