import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {MODAL_MOTION, assertModalSubmissionEnabled, sha256Hex, submitModalMotion,
  pollModalMotion} from '../../supabase/functions/beatvision-generation/modal-motion.ts';
import {loadGeneration} from './generation-runtime.mjs';

const edge=readFileSync(new URL('../../supabase/functions/beatvision-generation/index.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../../src/pages/ProductionWorkspacePage.tsx',import.meta.url),'utf8');
const safeEnv = k => ({
  MODAL_TOKEN_ID:'fixture-id',
  MODAL_TOKEN_SECRET:'fixture-secret',
  BRAGORA_MODAL_GPU_ENABLED:'true',
  BRAGORA_MODAL_BUDGET_VERIFIED:'true',
})[k]||'';
const noSpendEnv=k=>k==='MODAL_TOKEN_ID'?'fixture-id':k==='MODAL_TOKEN_SECRET'?'fixture-secret':'';
const uuids=['00000001-0000-4000-8000-000000000001','00000002-0000-4000-8000-000000000002',
  '00000003-0000-4000-8000-000000000003','00000004-0000-4000-8000-000000000004'];

test('Modal cannot submit without credentials and budget enablement',()=>{
  assert.throws(()=>assertModalSubmissionEnabled(noSpendEnv),/MODAL_GPU_NOT_ENABLED/);
  assert.throws(()=>assertModalSubmissionEnabled(()=>''),/MODAL_CREDENTIALS_UNAVAILABLE/);
});
function fixtureImage() {
  const image = new Uint8Array(64);
  image.set([137,80,78,71,13,10,26,10]);
  return image;
}
async function fixturePayload(image = fixtureImage()) {
  return {
    project_id:uuids[0],scene_id:uuids[1],source_image_id:uuids[2],generation_job_id:uuids[3],
    image_sha256:await sha256Hex(image),prompt:'A character moves within the approved location.',seed:42,
  };
}
test('Modal submit sends exactly one proxy-authenticated HTTPS request with approved input',async()=>{
  const image=fixtureImage(), payload=await fixturePayload(image);
  const calls=[];
  const requester=async (url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify({job_id:'fc-testproof01'}),{status:200});
  };
  const result=await submitModalMotion(payload,image,safeEnv,requester);
  assert.deepEqual(result,{status:'processing',job_id:'fc-testproof01',
    provider:MODAL_MOTION.provider,model:MODAL_MOTION.model,source_sha256:payload.image_sha256});
  assert.equal(calls.length,1);
  const {url,options}=calls[0];
  assert.equal(url,MODAL_MOTION.apiBase+'/submit');
  assert.equal(options.method,'POST');
  assert.equal(options.headers['Modal-Key'],'fixture-id');
  assert.equal(options.headers['Modal-Secret'],'fixture-secret');
  assert.equal(options.headers['Content-Type'],'application/json');
  assert.ok(options.signal instanceof AbortSignal);
  const body=JSON.parse(options.body);
  assert.deepEqual(body.payload,payload);
  assert.equal(body.ack,'I_AUTHORIZE_ONE_MODAL_GPU_PROOF_WITHIN_MY_CONFIRMED_BUDGET');
  assert.deepEqual(new Uint8Array(Buffer.from(body.image_base64,'base64')),image);
  assert.equal(url.includes('fixture-secret'),false);
  assert.equal(options.body.includes('fixture-secret'),false);
});
test('Invalid source provenance fails before any Modal HTTP request',async()=>{
  const image=fixtureImage(), payload=await fixturePayload(image);
  let requests=0;
  const requester=async()=>{requests++;throw new Error('unexpected request');};
  const cases=[
    [{...payload,image_sha256:'f'.repeat(64)},image,'MODAL_IMAGE_DIGEST_INVALID'],
    [{...payload,scene_id:'invalid'},image,'MODAL_REQUEST_ID_INVALID'],
    [{...payload,prompt:'short'},image,'MODAL_PROMPT_INVALID'],
    [{...payload,seed:0},image,'MODAL_SEED_INVALID'],
    [payload,new Uint8Array(4),'MODAL_MEDIA_SIZE_INVALID'],
  ];
  for(const [candidate,source,code] of cases)
    await assert.rejects(submitModalMotion(candidate,source,safeEnv,requester),
      error=>error.code===code);
  assert.equal(requests,0);
});
test('Invalid Modal submit receipt is rejected without retry',async()=>{
  const image=fixtureImage(),payload=await fixturePayload(image);
  let requests=0;
  const requester=async()=>{requests++;return new Response(JSON.stringify({job_id:'bad-id'}),{status:200});};
  await assert.rejects(submitModalMotion(payload,image,safeEnv,requester),/MODAL_JOB_RECEIPT_INVALID/);
  assert.equal(requests,1);
});
test('Modal HTTP failure does not retry or silently fall back to Hugging Face',async()=>{
  const image=fixtureImage(),payload=await fixturePayload(image);
  let requests=0;
  const requester=async()=>{requests++;return new Response(JSON.stringify({error:'UNAVAILABLE'}),{status:503});};
  await assert.rejects(submitModalMotion(payload,image,safeEnv,requester),/MODAL_HTTP_503/);
  assert.equal(requests,1);
  let failures=0;
  await assert.rejects(submitModalMotion(payload,image,safeEnv,async()=>{
    failures++;throw new TypeError('network unavailable');
  }),/MODAL_HTTP_UNAVAILABLE/);
  assert.equal(failures,1);
});
test('Modal polling performs one authenticated GET; HTTP 202 remains processing',async()=>{
  const requests=[];
  const requester=async(url,options)=>{
    requests.push({url,options});
    return new Response(JSON.stringify({status:'processing'}),{status:202});
  };
  const result=await pollModalMotion('fc-existing01',noSpendEnv,requester);
  assert.deepEqual(result,{status:'processing'});
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,MODAL_MOTION.apiBase+'/poll/fc-existing01');
  assert.equal(requests[0].options.method,'GET');
  assert.equal(requests[0].options.body,undefined);
  assert.equal(requests[0].options.headers['Modal-Key'],'fixture-id');
  assert.equal(requests[0].options.headers['Modal-Secret'],'fixture-secret');
});
test('Invalid poll call ID cannot reach Modal; completed poll decodes returned video',async()=>{
  let calls=0;
  const requester=async(url,options)=>{
    calls++;
    assert.equal(url,MODAL_MOTION.apiBase+'/poll/fc-complete01');
    assert.equal(options.method,'GET');
    return new Response(JSON.stringify({
      status:'completed',video_base64:Buffer.from(fixtureImage()).toString('base64'),
      manifest:{provider:'modal',model:MODAL_MOTION.model},
    }),{status:200});
  };
  await assert.rejects(pollModalMotion('invalid',noSpendEnv,requester),/MODAL_JOB_ID_INVALID/);
  assert.equal(calls,0);
  const result=await pollModalMotion('fc-complete01',noSpendEnv,requester);
  assert.equal(calls,1);
  assert.equal(result.status,'completed');
  assert.deepEqual(result.video,fixtureImage());
  assert.equal(result.manifest.model,MODAL_MOTION.model);
});
test('App explicitly selects Modal and retains HF as the default',()=>{
  assert.match(ui,/useState<"huggingface" \| "modal">\("huggingface"\)/);
  assert.match(ui,/provider: motionProvider/);
  assert.match(ui,/action: "modal_capability", projectId/);
  assert.match(ui,/modal_supported !== true \|\| probe\.data\?\.modal_available !== true/);
  assert.match(ui,/!job\?\.input_snapshot\?\.modal_motion/);
  assert.match(edge,/modal_supported: true, modal_available: available/);
  assert.match(edge,/\["image_url", "motion_url", "enqueue_ai_motion", "motion_eligibility", "modal_capability"\]/);

  assert.match(ui,/Modal LTX 0\.9\.5 \(account-gated\)/);
  assert.match(edge,/if \(provider === "modal"\)/);
  assert.match(edge,/assertModalSubmissionEnabled\(\)/);
  assert.match(edge,/modalBridgeSubmit\(db,job\)/);
  assert.match(edge,/modalBridgePoll\(db,job\)/);
  assert.match(edge,/\.eq\("approved",true\)\.eq\("status","approved"\)/);
  assert.match(edge,/storage\.upload\(path,result\.video,\{contentType:"video\/mp4",upsert:false\}\)/);
});
test('Generation controller fixture loads both providers without GPU calls',async()=>{
  const instance=await loadGeneration();try {assert.equal(typeof instance.run,'function');}finally{await instance.cleanup();}
});

// These exercise the real adapter with local streams/loopback HTTP only.
// No provider request, model inference, real credentials or motion proof.
test('Modal transport refuses redirects before forwarding proxy credentials',async()=>{
  let redirected=0;
  const server=createServer((req,res)=>{
    if(req.url==='/redirected') {
      redirected++;
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({status:'processing'}));
    } else {
      res.writeHead(302,{Location:'/redirected'});
      res.end();
    }
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  try {
    await assert.rejects(pollModalMotion('fc-redirect01',noSpendEnv,(_url,options)=>
      fetch(origin+'/poll',options)),/MODAL_HTTP_UNAVAILABLE/);
    assert.equal(redirected,0,'credentialed redirect target must never be contacted');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});
test('Modal transport rejects oversized Content-Length before reading the body',async()=>{
  let cancelled=false;
  const response=new Response(new ReadableStream({
    start(controller){controller.enqueue(new TextEncoder().encode('{"status":"processing"}'));controller.close();},
    cancel(){cancelled=true;},
  }),{headers:{'content-length':String(16*1024*1024+1)}});
  await assert.rejects(pollModalMotion('fc-length01',noSpendEnv,async()=>response),
    /MODAL_HTTP_RESPONSE_TOO_LARGE/);
  assert.equal(cancelled,true,'unread oversized response must be cancelled');
});
test('Modal transport bounds a chunked body without trusting Content-Length',async()=>{
  let cancelled=false,reads=0;
  const chunk=new Uint8Array(1024*1024).fill(32);
  const response=new Response(new ReadableStream({
    pull(controller){
      reads++;
      if(reads<=17) controller.enqueue(chunk);
      else {controller.enqueue(new TextEncoder().encode('{"status":"processing"}'));controller.close();}
    },
    cancel(){cancelled=true;},
  }));
  await assert.rejects(pollModalMotion('fc-stream01',noSpendEnv,async()=>response),
    /MODAL_HTTP_RESPONSE_TOO_LARGE/);
  assert.equal(cancelled,true,'oversized stream must be cancelled');
  assert.ok(reads<=18,'stop consuming immediately after crossing the limit');
});
test('Modal transport keeps the deadline active while a response body stalls',async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  let signal,stream;
  const pending=pollModalMotion('fc-timeout01',noSpendEnv,async(_url,options)=>{
    signal=options.signal;
    return new Response(new ReadableStream({start(controller){
      stream=controller;
      signal.addEventListener('abort',()=>controller.error(new DOMException('Timed out','AbortError')),{once:true});
    }}));
  });
  // Attach immediately so deliberate cleanup on the failing baseline is handled.
  pending.catch(()=>{});
  try {
    await nextTurn();
    context.mock.timers.tick(20_001);
    assert.equal(signal.aborted,true,'headers must not clear the body-read deadline');
    await assert.rejects(pending,/MODAL_HTTP_TIMEOUT/);
  } finally {
    if(!signal.aborted) stream.error(new DOMException('Test cleanup','AbortError'));
    await pending.catch(()=>{});
  }
});
test('Modal transport accepts a complete maximum-size base64 clip envelope',async()=>{
  const video=new Uint8Array(MODAL_MOTION.maxBytes).fill(1);
  const result=await pollModalMotion('fc-maxclip01',noSpendEnv,async()=>new Response(JSON.stringify({
    status:'completed',video_base64:Buffer.from(video).toString('base64'),
    manifest:{provider:'modal',model:MODAL_MOTION.model},
  })));
  assert.equal(result.status,'completed');
  assert.deepEqual(result.video,video);
});
