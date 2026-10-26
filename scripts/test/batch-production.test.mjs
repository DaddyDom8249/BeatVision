import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import ts from 'typescript';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
const rootDir=fileURLToPath(new URL('../../',import.meta.url));
const dir=await mkdtemp(join(rootDir,'.batch-test-'));
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
for(const [source,dest] of [['src/lib/batchProduction.ts','engine.mjs'],['src/lib/formatCreativeText.ts','errors.mjs']])
  await writeFile(join(dir,dest),compile(await readFile(join(rootDir,source),'utf8')));
await writeFile(join(dir,'stub.mjs'),'export const supabase = new Proxy({}, {get:(_,key)=>globalThis.__batchDb[key]});');
await writeFile(join(dir,'panel.mjs'),compile((await readFile(join(rootDir,'src/components/production/BatchProductionPanel.tsx'),'utf8'))
  .replace('"../../lib/supabase/client"','"./stub.mjs"').replace('"../../lib/batchProduction"','"./engine.mjs"').replace('"../../lib/formatCreativeText"','"./errors.mjs"')));
const {generateBatch,approvalCandidates,approveBatch,batchRequestId}=await import(pathToFileURL(join(dir,'engine.mjs')));
const Panel=(await import(pathToFileURL(join(dir,'panel.mjs')))).default;
after(()=>rm(dir,{recursive:true,force:true}));
const scenes=n=>Array.from({length:n},(_,i)=>({id:'scene-'+i,scene_number:i+1,status:'approved',title:'Shot '+(i+1),start_time:i*5,end_time:(i+1)*5}));
function fixture({count=3,kind='image',failedAt=-1,transportFail=false,missingImage=-1,capability=true}={}) {
  const all=scenes(count), assets=[], jobs=[],calls=[],rpcCalls=[],events=[];
  const image=(scene,approved=true)=>({id:'source-'+scene.id,scene_id:scene.id,project_id:'p',visual_plan_id:'v',storage_path:'p/scene-images/'+scene.id,image_url:'https://fixture.test/image.png',status:approved?'approved':'generated',approved});
  if(kind==='motion') all.forEach((s,i)=>{if(i!==missingImage)assets.push({...image(s),kind:'image'});});
  const db={from(table){const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},then(resolve,reject){
    events.push({table,filters:{...filters}});
    const list=table==='generation_jobs'?jobs:assets.filter(a=>a.kind===(table==='scene_image_assets'?'image':'motion'));
    const matches=list.filter(a=>Object.entries(filters).every(([k,v])=>a[k]===v));
    return Promise.resolve({data:table==='generation_jobs'?matches.at(-1)??null:[...matches].reverse(),error:null}).then(resolve,reject);
  }};return q;},
  async rpc(name,args){rpcCalls.push({name,args});if(name.startsWith('approve_')){const a=assets.find(a=>a.id===args.p_asset_id);a.approved=true;a.status='approved';return {data:{...a},error:null};}
    return {data:newJob(args.p_scene_id,'image',args.p_request_id),error:null};},
  functions:{async invoke(name,{body}){calls.push(body);
    if(body.action==='modal_capability')return {data:{modal_supported:true,modal_available:capability},error:null};
    if(body.action==='image_url')return {data:{image_url:'https://fixture.test/'+body.assetId+'.png'},error:null};
    if(body.action==='motion_url')return {data:{video_url:'https://fixture.test/'+body.assetId+'.mp4'},error:null};
    if(body.action==='enqueue_ai_motion')return {data:{job:newJob(body.sceneId,'motion',body.requestId,body.sourceImageId)},error:null};
    const j=jobs.find(j=>j.id===body.jobId);assert.ok(j);
    if(transportFail)return {error:new Error('NETWORK_INTERRUPTED')};
    if(body.action==='run'){j.status='processing';return {data:{job:{...j}},error:null};}
    const index=all.findIndex(s=>s.id===j.visual_plan_scene_id);
    j.status=index===failedAt?'failed':'completed';
    if(j.status==='completed')assets.push({id:'asset-'+j.id,scene_id:j.visual_plan_scene_id,project_id:'p',visual_plan_id:'v',kind:j.job_type==='scene_image'?'image':'motion',generation_job_id:j.id,image_url:'https://fixture.test/a.png',storage_path:'p/scene-images/a.png',video_url:'https://fixture.test/a.mp4',status:'generated',approved:false});
    return {data:{job:{...j}},error:null};
  }}};
  function newJob(sceneId,type,requestId,source){const existing=jobs.find(j=>j.requestId===requestId);if(existing)return {...existing};
    const j={id:'job-'+jobs.length,project_id:'p',visual_plan_id:'v',visual_plan_scene_id:sceneId,job_type:type==='image'?'scene_image':'scene_motion',status:'queued',requestId,input_snapshot:type==='motion'?{modal_motion:{source_image_id:source}}:{}};jobs.push(j);return {...j};}
  const progress=[];const options={db,projectId:'p',planId:'v',scenes:all,kind,acceptedTerms:true,stopped:()=>false,progress:p=>progress.push(p),wait:async()=>{}};
  return {db,all,assets,jobs,calls,rpcCalls,events,options,progress,image};
}
test('57 images dispatch one at a time, count saved assets and never approve or assemble',async()=>{
  const f=fixture({count:57});await generateBatch(f.options);
  assert.equal(f.jobs.length,57);assert.equal(f.assets.length,57);assert.equal(f.progress.at(-1).done,57);
  assert.equal(f.rpcCalls.filter(c=>c.name.startsWith('approve')).length,0);
  assert.equal(f.calls.filter(c=>c.action==='run').length,57);
  assert.ok(f.jobs.every(j=>j.status==='completed'));
  for(const e of f.events){assert.equal(e.filters.project_id,'p');assert.equal(e.filters.visual_plan_id,'v');assert.ok(e.filters.scene_id||e.filters.visual_plan_scene_id);}
});
test('motion uses approved source and Modal exclusively, skips saved media',async()=>{
  const f=fixture({kind:'motion'});await generateBatch(f.options);const queued=f.calls.filter(c=>c.action==='enqueue_ai_motion');
  assert.equal(queued.length,3);assert.ok(queued.every(c=>c.provider==='modal'&&c.acceptedTerms&&c.sourceImageId==='source-'+c.sceneId));
  await generateBatch(f.options);assert.equal(f.calls.filter(c=>c.action==='enqueue_ai_motion').length,3);
});
test('long scenes, missing terms and missing capability block motion before enqueue',async()=>{
  for(const mode of ['long','terms','capability']){const f=fixture({kind:'motion',capability:mode!=='capability'});if(mode==='long')f.all[0].end_time=52;if(mode==='terms')f.options.acceptedTerms=false;
    await assert.rejects(generateBatch(f.options));assert.equal(f.calls.filter(c=>c.action==='enqueue_ai_motion').length,0);}
});
test('missing approved image stops before dispatching that scene or later scenes',async()=>{
  const f=fixture({kind:'motion',missingImage:1});await assert.rejects(generateBatch(f.options),/approve exactly one/);assert.equal(f.jobs.length,1);
});
test('provider failure pauses batch and resume does not retry failed scene',async()=>{
  const f=fixture({count:5,failedAt:1});await assert.rejects(generateBatch(f.options),/failed/);assert.equal(f.jobs.length,2);
  await assert.rejects(generateBatch(f.options),/No automatic retry/);assert.equal(f.jobs.length,2);
});
test('pause preserves active attempt and resume polls it without creating a duplicate',async()=>{
  const f=fixture();let stop=false;await generateBatch({...f.options,stopped:()=>stop,wait:async()=>{stop=true;}});
  assert.equal(f.jobs.length,1);assert.equal(f.jobs[0].status,'processing');assert.equal(f.progress.at(-1).done,0);
  await generateBatch(f.options);assert.equal(f.jobs.length,3);assert.equal(f.rpcCalls.length,3);assert.equal(f.progress.at(-1).done,3);
});
test('transport failure retains saved job for next click',async()=>{
  const f=fixture({transportFail:true});await assert.rejects(generateBatch(f.options),/NETWORK_INTERRUPTED/);assert.equal(f.jobs.length,1);
  await assert.rejects(generateBatch(f.options),/NETWORK_INTERRUPTED/);assert.equal(f.jobs.length,1);
});
test('stable request IDs survive reloads and distinguish plan, type and image',async()=>{
  const id=await batchRequestId('p','s','motion','i');assert.equal(id,await batchRequestId('p','s','motion','i'));
  assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  for(const args of [['q','s','motion','i'],['p','s','image','i'],['p','s','motion','j']])assert.notEqual(id,await batchRequestId(...args));
});
test('review snapshots newest candidate, skips approved takes, and bulk approval uses exact reviewed IDs',async()=>{
  const f=fixture();await generateBatch(f.options);f.assets[0].approved=true;f.assets[0].status='approved';
  const candidates=await approvalCandidates(f.db,'p','v',f.all,'image');assert.equal(candidates.length,2);
  await approveBatch({...f.options,candidates});assert.equal(f.assets.filter(a=>a.approved).length,3);
  assert.deepEqual(f.rpcCalls.filter(c=>c.name==='approve_scene_image_asset').map(c=>c.args.p_asset_id),candidates.map(c=>c.asset.id));
});
test('bulk approval stops on a changed choice and never replaces an approved take',async()=>{
  const f=fixture();await generateBatch(f.options);const candidates=await approvalCandidates(f.db,'p','v',f.all,'image');
  f.assets.push({...f.image(f.all[0]),kind:'image'});await assert.rejects(approveBatch({...f.options,candidates}),/selection changed/);
  assert.equal(f.rpcCalls.filter(c=>c.name.startsWith('approve')).length,0);
});
async function mount(f){const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__batchDb=f.db;
  const root=createRoot(document.getElementById('root'));let refreshed=0;await act(async()=>root.render(React.createElement(Panel,{projectId:'p',planId:'v',scenes:f.all,disabled:false,onBusy:()=>{},onRefresh:async()=>{refreshed++;}})));
  const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
  return {button,click:async text=>{await act(async()=>button(text).dispatchEvent(new window.MouseEvent('click',{bubbles:true})));},cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.__batchDb;},refreshed:()=>refreshed};}
test('real review UI requires explicit confirmation and updates approval progress to completion',async()=>{
  const f=fixture();await generateBatch(f.options);const v=await mount(f);try{
    assert.equal(f.rpcCalls.filter(c=>c.name.startsWith('approve')).length,0);
    await v.click('Review & Approve All Images');assert.equal(document.querySelectorAll('img').length,3);
    assert.equal(v.button('Approve All Reviewed Images').disabled,true);
    const checkboxes=[...document.querySelectorAll('input[type=checkbox]')];await act(async()=>checkboxes.at(-1).dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
    assert.equal(v.button('Approve All Reviewed Images').disabled,false);await v.click('Approve All Reviewed Images');
    assert.equal(document.querySelector('progress').value,3);assert.equal(document.querySelector('progress').max,3);assert.equal(f.assets.filter(a=>a.approved).length,3);
  }finally{await v.cleanup();}
});
test('preview failure deselects candidate and cannot be bulk approved',async()=>{
  const f=fixture({count:1});await generateBatch(f.options);const v=await mount(f);try{await v.click('Review & Approve All Images');await act(async()=>document.querySelector('img').dispatchEvent(new window.Event('error')));
    assert.equal(v.button('Approve All Reviewed Images').disabled,true);assert.match(document.body.textContent,/Preview unavailable/);
  }finally{await v.cleanup();}
});
test('batch motion button is blocked for long scenes while individual flow remains separate',async()=>{
  const f=fixture();f.all[0].end_time=52;const v=await mount(f);try{assert.equal(v.button('Generate All 5-Second Motion Clips').disabled,true);assert.match(document.body.textContent,/5-second shot revision/);assert.equal(f.jobs.length,0);}finally{await v.cleanup();}
});
test('approval pause is partial and resume counts already saved approvals without resubmission',async()=>{
  const f=fixture();await generateBatch(f.options);const candidates=await approvalCandidates(f.db,'p','v',f.all,'image');let stop=false;
  await approveBatch({...f.options,candidates,stopped:()=>stop,progress:()=>{stop=true;}});assert.equal(f.assets.filter(a=>a.approved).length,1);
  await approveBatch({...f.options,candidates});assert.equal(f.assets.filter(a=>a.approved).length,3);
  assert.equal(f.rpcCalls.filter(c=>c.name==='approve_scene_image_asset').length,3);assert.equal(f.progress.at(-1).done,3);
});
test('bulk motion approval uses motion RPC and makes no generation request',async()=>{
  const f=fixture({kind:'motion'});await generateBatch(f.options);const candidates=await approvalCandidates(f.db,'p','v',f.all,'motion');const before=f.calls.length;
  await approveBatch({...f.options,candidates});assert.equal(f.calls.length,before);assert.equal(f.rpcCalls.filter(c=>c.name==='approve_motion_clip_asset').length,3);
});
test('a candidate rejected after review cannot be approved',async()=>{
  const f=fixture();await generateBatch(f.options);const candidates=await approvalCandidates(f.db,'p','v',f.all,'image');f.assets[0].status='rejected';
  await assert.rejects(approveBatch({...f.options,candidates}),/selection changed/);assert.equal(f.rpcCalls.filter(c=>c.name.startsWith('approve')).length,0);
});
test('a motion job for another source stops without running it or later scenes',async()=>{
  const f=fixture({kind:'motion'});f.jobs.push({id:'foreign-source',project_id:'p',visual_plan_id:'v',visual_plan_scene_id:'scene-0',job_type:'scene_motion',status:'processing',input_snapshot:{modal_motion:{source_image_id:'different-image'}}});
  await assert.rejects(generateBatch(f.options),/different motion provider or source/);assert.equal(f.calls.filter(c=>c.action==='run'||c.action==='poll').length,0);assert.equal(f.jobs.length,1);
});
test('completed state without saved media does not advance the progress bar',async()=>{
  const f=fixture();const invoke=f.db.functions.invoke;f.db.functions.invoke=async(name,args)=>{
    const result=await invoke(name,args);if(args.body.action==='poll')f.assets.length=0;return result;
  };
  await assert.rejects(generateBatch(f.options),/no saved media/);assert.equal(f.progress.at(-1).done,0);assert.equal(f.jobs.length,1);
});
test('procedural image-motion candidates are not offered for real-motion bulk approval',async()=>{
  const f=fixture({kind:'motion'});await generateBatch(f.options);for(const asset of f.assets.filter(a=>a.kind==='motion'))asset.model='image-motion';
  assert.deepEqual(await approvalCandidates(f.db,'p','v',f.all,'motion'),[]);
});
