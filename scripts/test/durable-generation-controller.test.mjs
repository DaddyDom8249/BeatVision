import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGeneration} from './generation-runtime.mjs';
const job={id:'batch-job',job_type:'scene_image',status:'queued',input_snapshot:{generation_batch_id:'saved-batch'},output:{}};
test('paused or later batch jobs never claim or contact a provider',async()=>{
 let writes=0;const db={rpc:async(name,args)=>{assert.equal(name,'generation_batch_dispatch_allowed');assert.equal(args.p_job_id,job.id);return {data:false,error:null};},from(){writes++;throw Error('must not write');}};
 const runtime=await loadGeneration(db);try{assert.deepEqual(await runtime.run(db,job),job);assert.equal(writes,0);}finally{await runtime.cleanup();}
});
test('database dispatch-check failure fails closed before provider work',async()=>{
 const db={rpc:async()=>({data:null,error:{message:'unavailable'}}),from(){throw Error('must not write');}};
 const runtime=await loadGeneration(db);try{await assert.rejects(runtime.run(db,job),/BATCH_DISPATCH_CHECK_FAILED/);}finally{await runtime.cleanup();}
});
test('allowed first batch job reaches the existing atomic job-claim boundary',async()=>{
 const events=[];const db={rpc:async()=>{events.push('guard');return {data:true,error:null};},from(){events.push('claim');const q={update(){return q;},eq(){return q;},select(){return q;},maybeSingle:async()=>({data:null,error:null})};return q;}};
 const runtime=await loadGeneration(db);try{await assert.rejects(runtime.run(db,job),/already claimed/);assert.deepEqual(events,['guard','claim']);}finally{await runtime.cleanup();}
});
test('scheduler uses the durable runnable queue while still polling active provider jobs',async()=>{
 const calls=[];const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='get_generation_scheduler_secret'?'fixture-secret':[],error:null};},from(table){assert.equal(table,'generation_jobs');const q={select(){return q;},in(k,v){assert.deepEqual(v,['submitted','processing']);return q;},order(){return q;},limit:async()=>({data:[],error:null})};return q;}};
 const runtime=await loadGeneration(db);try{const response=await runtime.handler(new Request('https://fixture.test/function',{method:'POST',headers:{'X-BeatVision-Queue-Secret':'fixture-secret','Content-Type':'application/json'},body:JSON.stringify({action:'drain'})}));assert.equal(response.status,200);assert.deepEqual((await response.json()).results,[]);assert.ok(calls.some(c=>c.name==='get_generation_dispatch_queue'&&c.args.p_limit===8));}finally{await runtime.cleanup();}
});

test('without budget approval queued images cause no DB claims or provider requests',async()=>{
 let calls=0;
 const db={rpc(){calls++;throw Error('unexpected rpc');},from(){calls++;throw Error('unexpected db');}};
 const rt=await loadGeneration(db,{BRAGORAFORGE_CLOUDFLARE_IMAGE_BUDGET_APPROVED:''});
 try {
   await assert.rejects(rt.run(db,job),e=>e.status===503&&e.code==='IMAGE_PROVIDER_BUDGET_DISABLED');
   assert.equal(calls,0);
 } finally {await rt.cleanup();}
});
