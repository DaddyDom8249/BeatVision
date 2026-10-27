import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { buildModalShotPrompt, MotionDirectionError } from "../../supabase/functions/beatvision-generation/shot-direction.ts";
import { MODAL_MOTION } from "../../supabase/functions/beatvision-generation/modal-motion.ts";

// Exercise the real motion-enqueue function with an in-memory database double.
// Never invoke a hosted Edge Function, provider, storage operation, or GPU.
const source = readFileSync(new URL("../../supabase/functions/beatvision-generation/index.ts", import.meta.url), "utf8");
const start = source.indexOf("async function enqueueHfMotion(");
const end = source.indexOf("async function hfBridgeSubmit(", start);
assert.ok(start >= 0 && end > start, "production candidate must contain the motion enqueue boundary");
const body = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let providerChecks = 0;
const enqueue = new Function(
  "HttpError", "MotionDirectionError", "buildModalShotPrompt",
  "assertModalSubmissionEnabled", "hfEligibility", "env", "modalFramesForScene",
  "MODAL_MOTION", "HF_MOTION",
  body + "\nreturn enqueueHfMotion;",
)(
  HttpError, MotionDirectionError, buildModalShotPrompt,
  () => { providerChecks++; },
  async () => { providerChecks++; },
  () => "fixture-no-network",
  () => 49, MODAL_MOTION, {revision:"fixture",space:"fixture",duration:2},
);

function fixture(movement) {
  const projectId="00000001-0000-4000-8000-000000000001";
  const sceneId="00000002-0000-4000-8000-000000000002";
  const planId="00000003-0000-4000-8000-000000000003";
  const imageId="00000004-0000-4000-8000-000000000004";
  const sourceJobId="00000005-0000-4000-8000-000000000005";
  const lockId="00000006-0000-4000-8000-000000000006";
  const inserts=[];
  const frozenScene={id:sceneId,start_time:0,end_time:2,movement_direction:movement,camera_direction:"Static camera"};
  const snapshot={scene:frozenScene,plan:{id:planId}};
  const base={id:sourceJobId,job_type:"scene_image",status:"completed",vision_lock_id:lockId,visual_plan_id:planId,input_snapshot:snapshot};
  const db={
    from(table) {
      const filters={};
      return {
        select(){return this;},
        eq(name,value){filters[name]=value;return this;},
        order(){return this;},
        limit(){return this;},
        async maybeSingle() {
          if(table==="visual_plan_scenes") return {data:{id:sceneId,visual_plan_id:planId,status:"approved"},error:null};
          if(table==="visual_plans") return {data:{id:planId,vision_lock_id:lockId,status:"approved"},error:null};
          if(table==="scene_image_assets") return {data:{id:imageId,storage_path:projectId+"/scene-images/frozen.png",generation_job_id:sourceJobId},count:1,error:null};
          if(table==="generation_jobs") return {data:null,error:null};
          throw new Error("Unexpected table: "+table);
        },
        async single() {
          assert.equal(table,"generation_jobs");
          assert.equal(filters.id,sourceJobId);
          return {data:base,error:null};
        },
        insert(record) {
          assert.equal(table,"generation_jobs");
          inserts.push(record);
          return {select:()=>({single:async()=>({data:{id:"new-job",...record},error:null})})};
        },
      };
    },
  };
  return {projectId,sceneId,imageId,inserts,db};
}

test("invalid frozen directions cause zero new jobs and zero provider submissions",async()=>{
  for(const movement of ["", "slow", "Minimal movement", "The actor walks or runs"]) {
    const f=fixture(movement);
    providerChecks=0;
    await assert.rejects(
      enqueue(f.db,f.projectId,f.sceneId,true,f.imageId,undefined,"modal"),
      error=>error instanceof HttpError && error.status===409 &&
        /^MODAL_SHOT_DIRECTION_/.test(error.code),
      "Direction must fail at enqueue: "+JSON.stringify(movement),
    );
    assert.equal(f.inserts.length,0,"no invalid shot may create a queued job");
    assert.equal(providerChecks,1,"budget gate may check configuration but not submit inference");
  }
});

test("one valid frozen, approved shot creates one model-specific queued job without inference",async()=>{
  const f=fixture("The approved actor lifts the lantern into view.");
  providerChecks=0;
  const job=await enqueue(f.db,f.projectId,f.sceneId,true,f.imageId,undefined,"modal");
  assert.equal(job.id,"new-job");
  assert.equal(f.inserts.length,1);
  assert.equal(f.inserts[0].job_type,"scene_motion");
  assert.equal(f.inserts[0].input_snapshot.modal_motion.source_image_id,f.imageId);
  assert.equal(providerChecks,1);
});
