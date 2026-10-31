import test from 'node:test';
import assert from 'node:assert/strict';
import {HF_MOTION,hfSubmit} from '../../supabase/functions/beatvision-generation/hf-motion.ts';
const params=['prompt','negative_prompt','input_image_filepath','input_video_filepath','height_ui','width_ui','mode','duration_ui','ui_frames_to_use','seed_ui','randomize_seed','ui_guidance_scale','improve_texture_flag'];
function metadata(reply,calls){return async(url,init={})=>{
  if(init.method==='POST'){calls.push(init);return reply();}
  if(url.endsWith('/whoami-v2'))return Response.json({type:'user',name:HF_MOTION.account,isPro:false});
  if(url.includes('/api/spaces/'))return Response.json({sha:HF_MOTION.revision,host:HF_MOTION.host,runtime:{stage:'RUNNING',hardware:{current:'zero-a10g'}}});
  return Response.json({named_endpoints:{'/image_to_video':{parameters:params.map(parameter_name=>({parameter_name})),returns:[{component:'Video'}],show_api:true}}});
};}
for(const [name,reply] of [
  ['malformed JSON',()=>new Response('{broken')],['empty body',()=>new Response('')],
  ['missing event',()=>Response.json({})],['unexpected schema',()=>Response.json([])],
  ['invalid event',()=>Response.json({event_id:'invented'})],
  ['body interruption',()=>new Response(new ReadableStream({start(c){c.error(new Error('body lost'));}}))],
  ['gateway failure',()=>Response.json({error:'unknown'},{status:502})],
  ['timeout response',()=>new Response('',{status:408})],
  ['oversized body',()=>new Response('x'.repeat(4097))],
  ['truncated JSON',()=>new Response('{"event_id":"'+ 'a'.repeat(32))],
  ['timeout after acceptance',()=>{throw new TypeError('response lost after POST');}],
])test('HF '+name+' after POST requires reconciliation and never resubmits',async()=>{
  const calls=[];
  await assert.rejects(hfSubmit('fixture','https://fixture.invalid/image.png','Synthetic approved scene',42,metadata(reply,calls)),error=>error.code==='HF_SUBMISSION_ACCEPTANCE_UNKNOWN');
  assert.equal(calls.length,1);
});
test('HF confirmed quota rejection remains distinguishable',async()=>{
  const calls=[];
  await assert.rejects(hfSubmit('fixture','https://fixture.invalid/image.png','Synthetic approved scene',42,metadata(()=>Response.json({error:'quota'},{status:429}),calls)),error=>error.code==='HF_QUOTA_EXHAUSTED');
  assert.equal(calls.length,1);
});
test('HF predispatch validation causes no request',async()=>{
  let calls=0;await assert.rejects(hfSubmit('fixture','http://invalid','',0,async()=>{calls++;}),/HF_INPUT_INVALID/);assert.equal(calls,0);
});

test('acceptance evidence hashes a malformed response without retaining raw secrets',async()=>{
  const calls=[],secret='fixture-only-secret';
  await assert.rejects(hfSubmit(secret,'https://fixture.invalid/image.png','Synthetic approved scene',42,
    metadata(()=>new Response('{private:'+secret),calls)),error=>{
      assert.equal(error.code,'HF_SUBMISSION_ACCEPTANCE_UNKNOWN');assert.equal(error.evidence.http_status,200);
      assert.match(error.evidence.body_sha256,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(error.evidence).includes(secret));return true;
    });
  assert.equal(calls.length,1);
});
