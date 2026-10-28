import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MODAL_MOTION, assertModalSubmissionEnabled, sha256Hex, submitModalMotion,
  pollModalMotion, lookupModalReceipt} from '../../supabase/functions/beatvision-generation/modal-motion.ts';
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

test('lost submit reply never retries and must remain reconciliation-required at controller boundary', async () => {
  const image=fixtureImage(),payload=await fixturePayload(image);
  let spawnRequests=0;
  await assert.rejects(submitModalMotion(payload,image,safeEnv,async()=>{
    spawnRequests++;
    throw new TypeError('accepted by provider but response lost');
  }), error=>error.code==='MODAL_HTTP_UNAVAILABLE');
  assert.equal(spawnRequests,1,'adapter cannot retry a possibly accepted request');
  assert.match(edge,/MODAL_HTTP_UNAVAILABLE/);
  assert.match(edge,/reconciliation_required: true/);
  assert.match(edge,/automatic_resubmission_disabled: true/);
});

test('Modal receipt lookup never invokes submit and distinguishes known from uncertain',async()=>{
  const id=uuids[3];const calls=[];
  const requester=async(url,opts)=>{
    calls.push({url,method:opts.method});
    return new Response(JSON.stringify(calls.length===1?{status:'processing',job_id:'fc-original01'}:{status:'reconciliation_required'}),{status:calls.length===1?200:202});
  };
  assert.deepEqual(await lookupModalReceipt(id,noSpendEnv,requester),{status:'known',job_id:'fc-original01'});
  assert.deepEqual(await lookupModalReceipt(id,noSpendEnv,requester),{status:'reconciliation_required'});
  assert.equal(calls.length,2);
  assert.ok(calls.every(x=>x.method==='GET'&&x.url.endsWith('/receipt/'+id)));
});
test('Modal worker reserves request atomically before spawn and refuses duplicate unknown submissions',()=>{
  const worker=readFileSync(new URL('../../providers/modal_motion/worker.py',import.meta.url),'utf8');
  const reservation=worker.indexOf('receipts.put(key, reservation, skip_if_exists=True)');
  const spawn=worker.indexOf('single_motion_proof.spawn(payload, source, ack)');
  assert.ok(reservation>0 && spawn>reservation);
  assert.match(worker,/return JSONResponse\(\{'status': 'reconciliation_required', 'receipt_known': False\}, status_code=202\)/);
  assert.match(worker,/@web.get\('\/receipt\/\{generation_job_id\}'\)/);
});
