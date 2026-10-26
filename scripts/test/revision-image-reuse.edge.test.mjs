import test from 'node:test';import assert from 'node:assert/strict';import {loadGeneration} from './generation-runtime.mjs';
const project='41000000-0000-4000-8000-000000000001',scene='41000000-0000-4000-8000-000000000002',image='41000000-0000-4000-8000-000000000003';
async function fixture(restored) {
 const inserts=[],rpc=[];
 const db={rpc:async(name,args)=>{rpc.push({name,args});return restored;},from(table){let inserted;
 const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},insert(row){inserted=row;inserts.push(row);return q;},
 async maybeSingle(){return table==='visual_plan_scenes'?{data:{id:scene,visual_plan_id:'new-plan',status:'approved'}}:table==='visual_plans'?{data:{id:'new-plan',vision_lock_id:'lock',status:'approved'}}:table==='scene_image_assets'?{data:{id:image,storage_path:project+'/scene-images/old.png',generation_job_id:null,reused_from_image_id:'old-image'},count:1}:{data:null};},
 async single(){if(!inserted)throw Error('must not look up old image job against new scene');return {data:{id:'new-motion-job',...inserted}};}};return q;}};
 const runtime=await loadGeneration(db,{MODAL_TOKEN_ID:'fixture',MODAL_TOKEN_SECRET:'fixture',BRAGORA_MODAL_GPU_ENABLED:'true',BRAGORA_MODAL_BUDGET_VERIFIED:'true',BRAGORA_MODAL_MAX_FRAMES:'121'});
 return {runtime,inserts,rpc,run:()=>runtime.enqueueHfMotion(db,project,scene,true,image,undefined,'modal')};
}
test('individual motion from reused image freezes new direction and original image provenance without inference',async()=>{
 const base={vision_lock_id:'lock',visual_plan_id:'new-plan',input_snapshot:{scene:{id:scene,start_time:0,end_time:5,movement_direction:'Lift the left hand.'},image_reuse:{source_generation_job_id:'old-job'}}};
 const f=await fixture({data:base,error:null});try{const result=await f.run();assert.equal(result.visual_plan_id,'new-plan');assert.equal(result.input_snapshot.scene.movement_direction,'Lift the left hand.');assert.equal(result.input_snapshot.modal_motion.source_image_id,image);assert.equal(result.input_snapshot.image_reuse.source_generation_job_id,'old-job');assert.deepEqual(f.rpc,[{name:'motion_snapshot_for_image',args:{p_asset_id:image}}]);assert.equal(f.inserts.length,1);}finally{await f.runtime.cleanup();}
});
test('missing or mismatched reuse lineage fails before job creation',async()=>{
 for(const restored of [{error:{message:'unavailable'}},{data:{visual_plan_id:'foreign-plan'}},{data:{visual_plan_id:'new-plan',vision_lock_id:'wrong-lock',input_snapshot:{scene:{id:scene}}}}]){
 const f=await fixture(restored);try{await assert.rejects(f.run(),/lineage/);assert.equal(f.inserts.length,0);}finally{await f.runtime.cleanup();}
 }
});
