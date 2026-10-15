import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadGeneration} from "./generation-runtime.mjs";

const migration=readFileSync(new URL("../../supabase/migrations/20261013224500_lock_final_video_writes.sql",import.meta.url),"utf8");
const host="https://shotstack-api-stage-output.s3-ap-southeast-2.amazonaws.com";
const job={job_type:"assembly",id:"test-job",project_id:"test-project",input_snapshot:{
 plan:{title:"Song",duration_seconds:2},audio_path:"song.mp3",scenes:[{scene:1}]
}};
function good(url=host+"/output.mp4"){
 return {ok:true,status:"done",result:{status:"done",video_url:url,duration_seconds:2,
 render_integrity:"PASS",media_validation:{probed:true,probe_provider:"shotstack",
 format:"mp4",has_video_stream:true,has_audio_stream:true,duration_seconds:2}}};
}
function fakeDb(){
 const writes=[];
 const table={
   select(){return {eq(){return {maybeSingle:async()=>({data:null,error:null})}}}},
   upsert(value,options){
     writes.push({value,options});
     return {select(){return {single:async()=>({data:value,error:null})}}};
   }
 };
 return {db:{from(name){assert.equal(name,"final_videos");return table;}},writes};
}
test("unprobed provider-completed MP4 cannot be persisted",async()=>{
 const runtime=await loadGeneration();
 try{
   const {db,writes}=fakeDb();const body=good();
   delete body.result.media_validation;
   await assert.rejects(runtime.persistFinalVideo(db,job,body),/FINAL_VIDEO_MEDIA_NOT_VERIFIED/);
   assert.equal(writes.length,0);
 }finally{await runtime.cleanup();}
});
test("untrusted final MP4 host is refused even with alleged proof",async()=>{
 const runtime=await loadGeneration();
 try{
   const {db,writes}=fakeDb();
   await assert.rejects(runtime.persistFinalVideo(db,job,good("https://evil.example/video.mp4")),/FINAL_VIDEO_OUTPUT_HOST_UNTRUSTED/);
   assert.equal(writes.length,0);
 }finally{await runtime.cleanup();}
});
test("verified MP4 missing a song audio stream never completes",async()=>{
 const runtime=await loadGeneration();
 try{
   const {db,writes}=fakeDb();const body=good();
   body.result.media_validation.has_audio_stream=false;
   await assert.rejects(runtime.persistFinalVideo(db,job,body),/FINAL_VIDEO_MEDIA_NOT_VERIFIED/);
   assert.equal(writes.length,0);
 }finally{await runtime.cleanup();}
});
test("probed duration must agree with the approved plan and provider result",async()=>{
 const runtime=await loadGeneration();
 try{
   const {db,writes}=fakeDb();const body=good();
   body.result.media_validation.duration_seconds=242;
   await assert.rejects(runtime.persistFinalVideo(db,job,body),/FINAL_VIDEO_DURATION_UNVERIFIED/);
   assert.equal(writes.length,0);
 }finally{await runtime.cleanup();}
});
test("verified media persists with measured duration and no asserted downloadability",async()=>{
 const runtime=await loadGeneration(); const oldFetch=globalThis.fetch;
 globalThis.Deno.env.get=()=> 'shotstack-api-stage-output.s3-ap-southeast-2.amazonaws.com';
 globalThis.fetch=async()=>new Response(readFileSync(new URL('./fixtures/final-media-contract.mp4',import.meta.url)));
 try{
   const {db,writes}=fakeDb();
   const output=await runtime.persistFinalVideo(db,job,good());
   assert.equal(output.render_status,"complete");
   assert.equal(output.downloadable,false);
   assert.equal(output.duration,2);
   assert.equal(writes.length,1);
 }finally{globalThis.fetch=oldFetch;await runtime.cleanup();}
});
test("migration restricts final_videos writes to service role while preserving owner reads",()=>{
 assert.match(migration,/revoke insert, update, delete on table public\.final_videos from public, anon, authenticated/i);
 assert.match(migration,/create policy final_videos_owner_select/);
 assert.match(migration,/for select to authenticated/);
 assert.match(migration,/p\.owner_id = \(select auth\.uid\(\)\)/);
 assert.match(migration,/grant all on table public\.final_videos to service_role/);
});
