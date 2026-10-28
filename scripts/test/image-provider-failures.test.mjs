import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGeneration } from './generation-runtime.mjs';

// Exercise actual dispatch, including the Worker’s real 502 error envelope.
async function dispatch(body, status = 502, source) {
  const job = {id:'image-job',project_id:'project',job_type:'scene_image',status:'queued',attempts:0,output:{},
    input_snapshot:{scene:{id:'scene',scene_number:1},vision_snapshot:{song:{analysis:{duration_seconds:5}}}}};
  let calls = 0;
  const db = {from(table) {
    assert.equal(table,'generation_jobs');
    const q = {update(value){Object.assign(job,value);return q;},eq(){return q;},in(){return q;},select(){return q;},
      maybeSingle:async()=>({data:{...job},error:null}),single:async()=>({data:{...job},error:null}),
      then(resolve){return Promise.resolve({data:[{...job}],error:null}).then(resolve);}};
    return q;
  }};
  const rt = await loadGeneration(db, {ARENA_GATEWAY_URL:'https://arena.example.com',ARENA_GATEWAY_ALLOWED_HOSTS:'arena.example.com',ARENA_GATEWAY_TOKEN:'test-secret'}, source);
  const previous = globalThis.fetch;
  globalThis.fetch = async()=>{calls++;return Response.json(body,{status});};
  try {
    const result = await rt.run(db,{...job});
    await rt.run(db,result); // Failed jobs are never automatically resubmitted.
    assert.equal(calls,1);
    assert.equal(result.status,'failed');
    assert.equal(result.attempts,1);
    return result;
  } finally {globalThis.fetch=previous;await rt.cleanup();}
}
const source = process.env.BRAGORA_IMAGE_FAILURE_SOURCE;
for (const [name,body,status,code] of [
  ['wrapped quota',{ok:false,status:'provider_error',error:'AI_ERROR: 3036: You have used up your daily free allocation of 10,000 neurons.'},502,'IMAGE_PROVIDER_QUOTA_EXHAUSTED'],
  ['wrapped capacity',{ok:false,error:'AiError: 3040: Capacity temporarily exceeded, please try again.'},502,'IMAGE_PROVIDER_CAPACITY_UNAVAILABLE'],
  ['structured quota',{ok:false,error:{code:3036,message:'limit'}},429,'IMAGE_PROVIDER_QUOTA_EXHAUSTED'],
  ['structured capacity',{ok:false,error:{code:3040,message:'busy'}},429,'IMAGE_PROVIDER_CAPACITY_UNAVAILABLE'],
  ['unidentified 429',{error:'rate limit'},429,'IMAGE_PROVIDER_RATE_LIMITED'],
  ['unrelated number',{error:'scene 3036 failed'},502,'IMAGE_PROVIDER_FAILED'],
  ['generic failure',{ok:false,error:'Failed https://private.test/file?token=secret',prompt:'private song lyrics',result:{images:[{image_url:'https://private.test/another'}]}},502,'IMAGE_PROVIDER_FAILED'],
  ['unavailable entitlement',{ok:false,code:'PROVIDER_COST_UNVERIFIED',error:'Workers Free entitlement not verified'},503,'PROVIDER_COST_UNVERIFIED'],
]) test(name+' persists a sanitized category without retries',async()=>{
  const result=await dispatch(body,status,source);
  assert.equal(result.error.code,code);
  assert.equal(result.error.message,code);
  assert.doesNotMatch(JSON.stringify(result.error),/private\.test|token=|private song lyrics/);
  assert.equal(result.error.detail.provider,'cloudflare-workers-ai');
  assert.equal(result.error.detail.http_status,status);
});
