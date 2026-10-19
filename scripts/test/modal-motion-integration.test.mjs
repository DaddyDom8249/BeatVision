import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
test('Modal worker submit makes exactly one authenticated spawn and preserves digest',async()=>{
  let spawns=0, args=null, closed=false, auth=null;
  const sdk={ModalClient:class {
    constructor(c){auth=c;}
    functions={fromName:async(app,fn)=>{assert.equal(app,MODAL_MOTION.app);assert.equal(fn,MODAL_MOTION.function);return {
      spawn:async(a)=>{spawns++;args=a;return {functionCallId:'fc-testproof01'};}
    }}};
    close(){closed=true;}
  }};
  const image=new Uint8Array(64);image.set([137,80,78,71,13,10,26,10]);
  const digest=await sha256Hex(image);
  const payload={project_id:uuids[0],scene_id:uuids[1],source_image_id:uuids[2],generation_job_id:uuids[3],
    image_sha256:digest,prompt:'A character moves within the approved location.',seed:42};
  const result=await submitModalMotion(payload,image,safeEnv,sdk);
  assert.equal(result.status,'processing');assert.equal(result.job_id,'fc-testproof01');
  assert.equal(result.source_sha256,digest);
  assert.equal(spawns,1);assert.deepEqual(args[0],payload);
  assert.deepEqual(args[1],image);
  assert.equal(auth.tokenId,'fixture-id');
  assert.equal(auth.tokenSecret,'fixture-secret');
  assert.equal(auth.maxRetries,0);
  assert.equal(closed,true);
});
test('Bad content or invalid provenance rejects before any Modal spawn',async()=>{
  let spawns=0;const sdk={ModalClient:class {functions={fromName:async()=>({spawn:async()=>{spawns++;}})};close(){}}};
  const bytes=new Uint8Array(64);
  await assert.rejects(submitModalMotion({project_id:uuids[0],scene_id:uuids[1],source_image_id:uuids[2],
    generation_job_id:uuids[3],image_sha256:'f'.repeat(64),prompt:'Character moves',seed:42},bytes,safeEnv,sdk),/MODAL_IMAGE_DIGEST_INVALID/);
  assert.equal(spawns,0);
});
test('Existing call polling never spawns a new GPU job',async()=>{
  let looked=0,closed=0;const sdk={ModalClient:class {
    functionCalls={fromId:async(id)=>{looked++;assert.equal(id,'fc-existing01');return {get:async()=>{const err=new Error('pending');err.name='TimeoutError';throw err;}}}};
    close(){closed++;}
  }};
  const result=await pollModalMotion('fc-existing01',noSpendEnv,sdk);
  assert.deepEqual(result,{status:'processing'});assert.equal(looked,1);assert.equal(closed,1);
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
