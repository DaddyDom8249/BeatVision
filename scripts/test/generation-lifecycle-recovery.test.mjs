import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadGeneration } from './generation-runtime.mjs';
import { MODAL_MOTION, sha256Hex } from '../../supabase/functions/beatvision-generation/modal-motion.ts';

const video = new Uint8Array(await readFile(new URL('./fixtures/final-media-contract.mp4', import.meta.url)));
const ids = [1,2,3,4].map(n => `0000000${n}-0000-4000-8000-00000000000${n}`);
const env = {MODAL_TOKEN_ID:'fixture', MODAL_TOKEN_SECRET:'fixture', SUPABASE_URL:'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY:'fixture-checkpoint-key'};

function fixture({age=60_000, receipt=true, signFailure=false, uploadFailure=false, dbFailure=false, completeFailure=false, checkpointFailure=false, dbAlwaysFailure=false, owner='owner'}={}) {
  let row={id:ids[3],project_id:ids[0],visual_plan_id:'plan',visual_plan_scene_id:ids[1],
    job_type:'scene_motion',status:'processing',created_at:new Date(Date.now()-age).toISOString(),
    updated_at:new Date(Date.now()-age).toISOString(),input_snapshot:{modal_motion:{source_image_id:ids[2],model:MODAL_MOTION.model,revision:MODAL_MOTION.revision}},
    output:{dispatch_started_at:new Date(Date.now()-age).toISOString(),modal_source_sha256:'source-hash',
      dispatch_intent:{request_id:'beatvision:'+ids[3],provider:'modal'},...(receipt?{upstream_job_id:'fc-existing'}:{})}};
  const frozen=structuredClone(row.input_snapshot), objects=new Map();
  let asset=null,failedWrites=0,uploads=0,clock=Date.now(),failSign=signFailure,failUpload=uploadFailure,failDb=dbFailure;
  const db={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},
    rpc:async(name)=>{
      assert.equal(name,'claim_generation_poll');
      row={...row,updated_at:new Date(++clock).toISOString(),poll_lease_token:'lease-fixture',poll_lease_until:new Date(Date.now()+120000).toISOString()};
      return {data:[structuredClone(row)],error:null};
    },
    from(table){let patch,inserted;const filters=[];
      const execute=async()=>{
        if(table==='projects') return {data:owner==='missing'?null:{id:ids[0],owner_id:'owner'},error:null};
        if(table==='scene_image_assets') return {data:{id:ids[2]},error:null};
        if(table==='motion_clip_assets') {
          if(inserted) {assert.equal(inserted.approved,false);asset={...inserted,id:'asset-one'};}
          return {data:structuredClone(asset),error:null};
        }
        assert.equal(table,'generation_jobs');
        if(filters.some(([k,vs])=>!vs.includes(row[k])))return{data:null,error:null};
        if(patch){
          assert.ok(!('input_snapshot' in patch),'Frozen input must not change');
          if(dbAlwaysFailure)return{data:null,error:{message:'INJECTED_PROLONGED_DATABASE_OUTAGE'}};
          if(completeFailure&&patch.status==='completed'){completeFailure=false;return{data:null,error:{message:'INJECTED_COMPLETION_WRITE_OUTAGE'}};}
          if(checkpointFailure&&patch.output?.motion_checkpoint){checkpointFailure=false;return{data:null,error:{message:'INJECTED_CHECKPOINT_WRITE_OUTAGE'}};}
          if(failDb&&patch.output?.last_polled_at){failDb=false;return{data:null,error:{message:'INJECTED_DATABASE_OUTAGE'}};}
          if(patch.status==='failed')failedWrites++;
          Object.assign(row,structuredClone(patch),{updated_at:new Date(++clock).toISOString()});
        }
        return{data:structuredClone(row),error:null};
      };
      return{update(v){patch=v;return this},insert(v){inserted=v;return this},select(){return this},
        eq(k,v){filters.push([k,[v]]);return this},in(k,vs){filters.push([k,vs]);return this},
        order(){return this},limit(){return this},single:execute,maybeSingle:execute,
        then(resolve,reject){return execute().then(r=>resolve({...r,data:r.data?[r.data]:[]}),reject)}};
    },storage:{from(bucket){assert.equal(bucket,'visual-assets');return{
      download:async path=>objects.has(path)?{data:new Blob([objects.get(path)]),error:null}:{data:null,error:{message:'not found'}},
      upload:async(path,bytes,options)=>{
        assert.ok(path.startsWith(ids[0]+'/scene-motion/plan/'+ids[1]+'/'+ids[3]));
        assert.equal(options.upsert,false);uploads++;
        if(failUpload){failUpload=false;return{error:{message:'INJECTED_STORAGE_OUTAGE'}};}
        if(objects.has(path))return{error:{message:'exists'}};
        objects.set(path,bytes);return{error:null};
      },
      createSignedUrl:async()=>{if(failSign){failSign=false;return{data:null,error:{message:'EXPIRED_SIGNING_CREDENTIAL'}};}return{data:{signedUrl:'https://fixture.invalid/private.mp4'},error:null};},
    };}},
  };
  return{db,row:()=>structuredClone(row),mutate:fn=>fn(row),frozen,objects,stats:()=>({failedWrites,uploads,asset})};
}

async function completeResponse() {
  return Response.json({status:'completed',video_base64:Buffer.from(video).toString('base64'),manifest:{
    project_id:ids[0],scene_id:ids[1],source_image_id:ids[2],generation_job_id:ids[3],source_sha256:'source-hash',
    video_sha256:await sha256Hex(video),model:MODAL_MOTION.model,revision:MODAL_MOTION.revision,creator_approved:false}});
}
async function runtime(f, request, work){
  const previous=globalThis.fetch;let gets=0,posts=0;
  globalThis.fetch=async(url,options={})=>{if((options.method||'GET')==='POST')posts++;else gets++;return request(String(url),options);};
  const r=await loadGeneration(f.db,env);
  try{return await work(r,()=>({gets,posts}));}
  finally{await r.cleanup();globalThis.fetch=previous;}
}

for(const kind of ['503','timeout','database'])test('accepted execution remains recoverable after '+kind+' polling failure',async()=>{
  const f=fixture({dbFailure:kind==='database'});
  await runtime(f,async()=>{
    if(kind==='timeout')throw new TypeError('INJECTED_NETWORK_TIMEOUT');
    return kind==='503'?Response.json({error:'busy'},{status:503}):Response.json({status:'processing'},{status:202});
  },async(r,calls)=>{
    const result=await r.poll(f.db,f.row());
    assert.equal(result.status,'processing');assert.equal(result.output.upstream_job_id,'fc-existing');
    assert.equal(f.stats().failedWrites,0);assert.equal(calls().posts,0);
    assert.deepEqual(result.input_snapshot,f.frozen);
  });
});

test('stored MP4 survives signing failure and fresh controller completes without provider access',async()=>{
  const f=fixture({signFailure:true});
  await runtime(f,completeResponse,async(r,calls)=>{
    const result=await r.poll(f.db,f.row());
    assert.equal(result.status,'processing');assert.equal(f.stats().failedWrites,0);
    assert.equal(calls().gets,1);assert.equal(calls().posts,0);
    assert.ok([...f.objects.keys()].some(path=>path.endsWith('.mp4')));
  });
  await runtime(f,async()=>{throw Error('PROVIDER_RESULT_MUST_NOT_BE_FETCHED_AGAIN');},async(r,calls)=>{
    const result=await r.poll(f.db,f.row());
    assert.equal(result.status,'completed');assert.equal(calls().gets,0);assert.equal(calls().posts,0);
    assert.equal(f.stats().asset.approved,false);assert.deepEqual(result.input_snapshot,f.frozen);
  });
});

test('storage outage retries the same existing execution without terminal failure',async()=>{
  const f=fixture({uploadFailure:true});
  await runtime(f,completeResponse,async(r,calls)=>{
    assert.equal((await r.poll(f.db,f.row())).status,'processing');
    const completed=await r.poll(f.db,f.row());assert.equal(completed.status,'completed');
    assert.equal(completed.output.reconciliation_required,false);
    assert.equal(calls().posts,0);assert.equal(f.stats().failedWrites,0);
  });
});

test('restart after31 minutes still discovers and retrieves an existing provider receipt',async()=>{
  const f=fixture({age:31*60_000,receipt:false});
  await runtime(f,async url=>url.includes('/receipt/')?Response.json({status:'processing',job_id:'fc-existing'}):completeResponse(),async(r,calls)=>{
    const adopted=await r.poll(f.db,f.row());
    assert.equal(adopted.output.upstream_job_id,'fc-existing');
    assert.equal((await r.poll(f.db,f.row())).status,'completed');
    assert.ok(calls().gets>=2);assert.equal(calls().posts,0);
  });
});

function ownerRequest(receiptId) {
  return new Request('https://fixture.invalid/',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({action:'reconcile',projectId:ids[0],jobId:ids[3],...(receiptId?{receiptId}:{})})});
}

test('lease claim refresh does not reset31-minute dispatch grace at owner endpoint',async()=>{
  const f=fixture({age:31*60_000,receipt:false});
  await runtime(f,async url=>{assert.ok(url.includes('/receipt/'));return Response.json({job_id:'fc-existing'});},async(r,calls)=>{
    const response=await r.handler(ownerRequest());assert.equal(response.status,200);
    assert.equal(f.row().output.upstream_job_id,'fc-existing');assert.equal(calls().gets,1);assert.equal(calls().posts,0);
  });
});

for(const failure of ['completeFailure','checkpointFailure'])test(failure+' resumes stored output after controller restart',async()=>{
  const f=fixture({[failure]:true});
  await runtime(f,completeResponse,async r=>assert.equal((await r.poll(f.db,f.row())).status,'processing'));
  await runtime(f,async()=>{throw Error('NO_PROVIDER_REFETCH');},async(r,calls)=>{
    assert.equal((await r.poll(f.db,f.row())).status,'completed');assert.equal(calls().gets,0);assert.equal(calls().posts,0);
    assert.equal(f.stats().failedWrites,0);assert.equal(f.stats().asset.approved,false);
  });
});

test('prolonged database refusal preserves accepted receipt and never writes failed',async()=>{
  const f=fixture({dbAlwaysFailure:true});
  await runtime(f,async()=>Response.json({status:'processing'},{status:202}),async(r,calls)=>{
    await assert.rejects(r.poll(f.db,f.row()),/GENERATION_RECOVERY_STATE_PERSIST_FAILED/);
    assert.equal(f.row().status,'processing');assert.equal(f.row().output.upstream_job_id,'fc-existing');
    assert.equal(f.stats().failedWrites,0);assert.equal(calls().posts,0);
  });
});

test('signed durable output recovers a lost database receipt without any provider access',async()=>{
  const f=fixture({signFailure:true});
  await runtime(f,completeResponse,async r=>assert.equal((await r.poll(f.db,f.row())).status,'processing'));
  f.mutate(row=>{delete row.output.upstream_job_id;delete row.output.motion_checkpoint;row.output.reconciliation_required=true;});
  await runtime(f,async()=>{throw Error('NO_PROVIDER_ACCESS');},async(r,calls)=>{
    const adopted=await r.poll(f.db,f.row());assert.equal(adopted.output.upstream_job_id,'fc-existing');
    assert.equal((await r.poll(f.db,f.row())).status,'completed');assert.equal(calls().gets,0);assert.equal(calls().posts,0);
  });
});

test('legacy accepted Modal source hash completes and remains recoverable after signing failure',async()=>{
  const f=fixture({signFailure:true});
  f.mutate(row=>{row.output.arena_response={source_sha256:row.output.modal_source_sha256};delete row.output.modal_source_sha256;});
  await runtime(f,completeResponse,async r=>assert.equal((await r.poll(f.db,f.row())).status,'processing'));
  await runtime(f,async()=>{throw Error('NO_PROVIDER_ACCESS');},async(r,calls)=>{
    assert.equal((await r.poll(f.db,f.row())).status,'completed');assert.equal(calls().gets,0);assert.equal(calls().posts,0);
  });
});

test('dedicated checkpoint key preserves recovery across database service-key rotation',async()=>{
  const previous=env.SUPABASE_SERVICE_ROLE_KEY;env.MOTION_CHECKPOINT_SIGNING_KEY='fixture-stable-signing-key';
  const f=fixture({signFailure:true});
  try {
    await runtime(f,completeResponse,async r=>assert.equal((await r.poll(f.db,f.row())).status,'processing'));
    env.SUPABASE_SERVICE_ROLE_KEY='fixture-rotated-service-key';
    await runtime(f,async()=>{throw Error('NO_PROVIDER_ACCESS');},async(r,calls)=>{
      assert.equal((await r.poll(f.db,f.row())).status,'completed');assert.equal(calls().gets,0);assert.equal(calls().posts,0);
    });
  } finally {env.SUPABASE_SERVICE_ROLE_KEY=previous;delete env.MOTION_CHECKPOINT_SIGNING_KEY;}
});

for(const field of ['project_id','upstream_job_id','input_sha256','signature'])test('tampered storage checkpoint cannot adopt or complete: '+field,async()=>{
  const f=fixture({signFailure:true});
  await runtime(f,completeResponse,async r=>r.poll(f.db,f.row()));
  const path=[...f.objects.keys()].find(p=>p.endsWith('.proof.json')),proof=JSON.parse(f.objects.get(path));
  proof[field]='forged';f.objects.set(path,JSON.stringify(proof));
  await runtime(f,async()=>{throw Error('NO_PROVIDER_ACCESS');},async(r,calls)=>{
    const result=await r.poll(f.db,f.row());assert.equal(result.status,'processing');
    assert.equal(result.output.reconciliation_required,true);assert.equal(f.stats().asset,null);
    assert.equal(calls().gets,0);assert.equal(calls().posts,0);
  });
});

for(const state of ['valid','running','other-job','conflicting'])test('owner manual candidate receipt: '+state,async()=>{
  const f=fixture({receipt:state==='conflicting'});
  await runtime(f,async()=>{
    if(state==='running')return Response.json({status:'processing'},{status:202});
    const data=await (await completeResponse()).json();if(state==='other-job')data.manifest.generation_job_id=ids[0];return Response.json(data);
  },async(r,calls)=>{
    const response=await r.handler(ownerRequest('fc-candidate'));
    if(state==='valid'){assert.equal(response.status,200);assert.equal(f.row().status,'completed');assert.equal(f.row().output.upstream_job_id,'fc-candidate');}
    else{assert.ok(response.status>=400);assert.equal(f.row().status,'processing');assert.equal(f.stats().asset,null);}
    assert.equal(calls().posts,0);assert.equal(f.stats().failedWrites,0);assert.deepEqual(f.row().input_snapshot,f.frozen);
  });
});

for(const owner of ['other','missing'])test('unauthorized reconciliation is rejected before provider access: '+owner,async()=>{
  const f=fixture({owner});
  await runtime(f,async()=>{throw Error('NO_PROVIDER_ACCESS');},async(r,calls)=>{
    const res=await r.handler(new Request('https://fixture.invalid/',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({action:'reconcile',projectId:ids[0],jobId:ids[3]})}));
    assert.equal(res.status,404);assert.equal(calls().gets,0);assert.equal(calls().posts,0);
  });
});

test('ninth recoverable job is selected behind eight permanent reconciliation holds',async()=>{
  const holds=Array.from({length:8},(_,i)=>({id:'hold-'+i,job_type:'scene_motion',status:'processing',created_at:new Date(0).toISOString(),output:{reconciliation_required:true}}));
  const ninth={id:'ninth',job_type:'scene_motion',status:'processing',created_at:new Date().toISOString(),output:{upstream_job_id:'fc-ninth'}};
  let polled=0;
  const db={rpc:async name=>name==='get_generation_scheduler_secret'?{data:'fixture'}:{data:[ninth]},from(){let statuses=[],changes;return{
    select(){return this},eq(k,v){if(k==='status')statuses=[v];return this},in(k,vs){statuses=vs;return this},order(){return this},
    update(v){changes=v;return this},async limit(n){return{data:statuses.includes('queued')?[]:[...holds,ninth].slice(0,n)}},
    async single(){return{data:{...ninth,...changes}}},async maybeSingle(){return{data:{...ninth,...changes}}},then(resolve){return Promise.resolve({data:[ninth]}).then(resolve)},
  };}};
  const f={db};
  await runtime(f,async()=>{polled++;return Response.json({status:'processing'},{status:202});},async r=>{
    globalThis.Deno.env.get=k=>({ARENA_GATEWAY_URL:'https://arena.invalid',ARENA_GATEWAY_TOKEN:'fixture'})[k]||'';
    const res=await r.handler(new Request('https://fixture.invalid/',{method:'POST',headers:{'X-BeatVision-Queue-Secret':'fixture','Content-Type':'application/json'},body:JSON.stringify({action:'drain'})}));
    assert.equal(res.status,200);const result=await res.json();
    assert.ok(result.results.some(x=>x.id==='ninth'),'The ninth job must actually be selected');assert.equal(polled,1);
  });
});

test('unsafe Arena configuration cannot receive provider credentials or submit work',async()=>{
  for(const url of ['http://arena.invalid','https://127.0.0.1','https://[::1]','https://user:password@arena.invalid','https://arena.internal','https://arena.local','https://arena.invalid:8443']){
    const f=fixture();f.mutate(row=>{row.input_snapshot={};});
    await runtime(f,async()=>{throw Error('NO_OUTBOUND_REQUEST');},async(r,calls)=>{
      const previous=globalThis.Deno.env.get;globalThis.Deno.env.get=k=>k==='ARENA_GATEWAY_URL'?url:k==='ARENA_GATEWAY_TOKEN'?'fixture-private-token':previous(k);
      const job=await r.poll(f.db,f.row());assert.equal(job.status,'processing');assert.equal(job.output.upstream_job_id,'fc-existing');
      assert.equal(calls().gets,0);assert.equal(calls().posts,0);
      assert.ok(!JSON.stringify(job.output).includes('fixture-private-token'));
    });
  }
});

test('Arena polling forbids redirects and redacts transport error details',async()=>{
  const f=fixture();f.mutate(row=>{row.input_snapshot={};});
  await runtime(f,async(_url,options)=>{assert.equal(options.redirect,'error');throw Error('fixture-private-token in transport');},async(r,calls)=>{
    const previous=globalThis.Deno.env.get;globalThis.Deno.env.get=k=>k==='ARENA_GATEWAY_URL'?'https://arena.invalid':k==='ARENA_GATEWAY_TOKEN'?'fixture-private-token':previous(k);
    const job=await r.poll(f.db,f.row());assert.equal(job.status,'processing');assert.equal(calls().gets,1);assert.equal(calls().posts,0);
    assert.ok(!JSON.stringify(job.output).includes('fixture-private-token'));
  });
});
