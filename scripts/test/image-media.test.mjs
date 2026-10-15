import test from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import {loadGeneration} from './generation-runtime.mjs';

const pixels=Buffer.alloc(16*16*4,128);
const jpg=jpeg.encode({width:16,height:16,data:pixels},80).data;
const png=PNG.sync.write({width:16,height:16,data:pixels});
test('decodes real JPEG and PNG and determines accurate extension/content type',async()=>{
 const runtime=await loadGeneration();try {
  assert.deepEqual(runtime.validateImage(jpg),{contentType:'image/jpeg',extension:'jpg',width:16,height:16});
  assert.deepEqual(runtime.validateImage(png),{contentType:'image/png',extension:'png',width:16,height:16});
  for(const bad of [Buffer.from('hello'),png.subarray(0,33),jpg.subarray(0,jpg.length-2),Buffer.from([255,216,255,217])])assert.throws(()=>runtime.validateImage(bad));
 }finally{await runtime.cleanup()}
});
test('invalid image bytes cause no upload or generated asset write',async()=>{
 let uploads=0,writes=0;
 const db={from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:null}},insert(){writes++;throw Error('unexpected')}}},storage:{from(){return {upload(){uploads++;throw Error('unexpected')}}}}};
 const runtime=await loadGeneration();try {
  await assert.rejects(runtime.persistSceneImage(db,{id:'j',job_type:'scene_image',visual_plan_scene_id:'scene'},{image_base64:Buffer.from('hello').toString('base64')}),/NOT_IMAGE/);
  assert.equal(uploads,0);assert.equal(writes,0);
 }finally{await runtime.cleanup()}
});

test('read-only approved-image preflight decodes only the owner-scoped signed source',async()=>{
 const where={};let signedPath;
 const db={from(table){assert.equal(table,'scene_image_assets');return{select(){return this},eq(k,v){where[k]=v;return this},async maybeSingle(){return{data:{id:'asset',storage_path:'project/scene-images/approved.png'}}}}},storage:{from(){return {async createSignedUrl(path){signedPath=path;return{data:{signedUrl:'https://project.supabase.co/storage/v1/object/sign/approved.png'}}}}}}};
 const runtime=await loadGeneration();const original=globalThis.fetch;globalThis.Deno.env.get=()=> 'https://project.supabase.co';globalThis.fetch=async()=>new Response(png);
 try {
  const result=await runtime.inspectApprovedImage(db,'project','asset');
  assert.equal(where.project_id,'project');assert.equal(where.approved,true);assert.equal(where.id,'asset');assert.equal(signedPath,'project/scene-images/approved.png');assert.equal(result.contentType,'image/png');assert.equal(result.width,16);
 }finally{globalThis.fetch=original;await runtime.cleanup()}
});
