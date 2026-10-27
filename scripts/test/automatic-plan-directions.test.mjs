import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import ts from 'typescript';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
const rootDir=fileURLToPath(new URL('../../',import.meta.url)),dir=await mkdtemp(join(rootDir,'.auto-plan-test-'));
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const read=path=>readFile(join(rootDir,path),'utf8');
await writeFile(join(dir,'shot.mjs'),compile(await read('supabase/functions/beatvision-generation/shot-direction.ts')));
await writeFile(join(dir,'engine.mjs'),compile((await read('src/lib/automaticPlanDirection.ts')).replace('"../../supabase/functions/beatvision-generation/shot-direction"','"./shot.mjs"')));
await writeFile(join(dir,'stub.mjs'),'export const supabase={functions:{invoke:(...a)=>globalThis.__autoPlan.functions.invoke(...a)},rpc:(...a)=>globalThis.__autoPlan.rpc(...a)};');
await writeFile(join(dir,'help.mjs'),compile((await read('src/components/plan/AutomaticPlanHelp.tsx')).replace('"../../lib/supabase/client"','"./stub.mjs"').replace('"../../lib/automaticPlanDirection"','"./engine.mjs"')));
const {preparePlanDirections,savePlanDirections}=await import(pathToFileURL(join(dir,'engine.mjs'))),Help=(await import(pathToFileURL(join(dir,'help.mjs')))).default;
after(()=>rm(dir,{recursive:true,force:true}));
const scenes=()=>Array.from({length:50},(_,i)=>({id:`scene-${i+1}`,scene_number:i+1,updated_at:'v1',project_id:'project',visual_plan_id:'plan',status:'draft'}));
function fixture({failAt=0,corrupt=false}={}){
 const source=scenes(),calls=[],saves=[];
 const client={functions:{invoke:async(name,{body})=>{
  calls.push({name,body});if(calls.length===failAt)return {data:{error:{message:'Daily free allowance reached.'}}};
  return {data:{plan_id:body.plan_id,interpretation_id:'interpretation',scene_proposals:body.scene_ids.map(id=>({scene_id:id,expected_updated_at:corrupt?'stale':'v1',
    timing:{source:'word_timestamps',precision:'Machine timing estimate'},scene_proposal:{mode:body.mode,lyric_excerpt:`Lyric for ${id}`,action:`The approved figure reaches toward the phone in ${id}.`,objects:['phone'],emotion:'dread',visual_direction:`The approved figure beside the phone in ${id}.`,camera:'Camera holds still.',meaning:`Story moment ${id}`,uncertainty:'Artist review required.'}}))}};
 }},rpc:async(name,args)=>{saves.push({name,args});return {data:args.p_repairs.length,error:null};}};
 return {client,source,calls,saves};
}
test('one preparation fills all50 scenes with distinct actions; one reviewed save, no individual input or automatic approval',async()=>{
 const f=fixture(),before=structuredClone(f.source);let progress=[];
 const proposals=await preparePlanDirections(f.client,'plan',f.source,'literal',[],rows=>progress.push(rows.length));
 assert.deepEqual(progress,[8,16,24,32,40,48,50]);assert.equal(f.calls.length,7);assert.equal(f.saves.length,0);assert.equal(new Set(proposals.map(p=>p.scene_proposal.action)).size,50);
 await savePlanDirections(f.client,'plan',f.source,proposals);assert.equal(f.saves.length,1);assert.equal(f.saves[0].name,'save_automatic_scene_directions');assert.equal(f.saves[0].args.p_repairs.length,50);
 assert.ok(f.saves[0].args.p_repairs.every(p=>p.actor.includes('Feeling: dread')));assert.deepEqual(f.source,before);
});
test('provider failure retains validated proposals, does not loop or save, and explicit continuation requests only missing scenes',async()=>{
 const f=fixture({failAt:2});let ready=[];
 await assert.rejects(preparePlanDirections(f.client,'plan',f.source,'literal',[],rows=>ready=rows),/Daily free allowance/);
 assert.equal(ready.length,8);assert.equal(f.calls.length,2);assert.equal(f.saves.length,0);
 const done=await preparePlanDirections(f.client,'plan',f.source,'literal',ready,rows=>ready=rows);assert.equal(done.length,50);assert.ok(f.calls.slice(2).every(c=>!c.body.scene_ids.includes('scene-1')));
});
test('stale proposal and locked drafts reject before saving or calling a model',async()=>{
 let f=fixture({corrupt:true});await assert.rejects(preparePlanDirections(f.client,'plan',f.source,'literal',[],()=>{}),/stale/);assert.equal(f.saves.length,0);
 f=fixture();f.source[0].status='approved';await assert.rejects(preparePlanDirections(f.client,'plan',f.source,'literal',[],()=>{}),/editable/);assert.equal(f.calls.length,0);
});
async function mount(t,{locked=false,longShots=false}={}){
 const f=fixture();if(longShots){f.source[0].start_time=0;f.source[0].end_time=25;}
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test/visual-plan?help=directions'});
 const previous={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});globalThis.__autoPlan=f.client;
 const root=createRoot(document.getElementById('root'));let saved=0,revised=0,shortened=0;
 await act(async()=>root.render(React.createElement(Help,{planId:'plan',locked,scenes:f.source,working:false,onSaved:async()=>saved++,onCreateRevision:async()=>revised++,onPrepareShortShots:async()=>shortened++})));
 const button=text=>[...document.querySelectorAll('button')].find(x=>x.textContent===text);
 const click=async el=>{assert.ok(el);await act(async()=>el.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));};
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,previous);delete globalThis.__autoPlan;});
 return {...f,button,click,saved:()=>saved,revised:()=>revised,shortened:()=>shortened};
}
test('beginner menu prepares whole story with one click and saves all directions only after one review',async t=>{
 const f=await mount(t);assert.equal(document.querySelectorAll('textarea').length,0);assert.equal(f.calls.length,0);
 await f.click(f.button('Prepare all 50 scenes for me'));assert.equal(f.calls.length,7);assert.equal(f.saves.length,0);assert.match(document.body.textContent,/50 of 50 scenes prepared/);
 assert.equal(f.button('Save all scene directions').disabled,true);
 await f.click([...document.querySelectorAll('input')].find(x=>x.type==='checkbox'));await f.click(f.button('Save all scene directions'));
 assert.equal(f.saves.length,1);assert.equal(f.saved(),1);assert.match(document.body.textContent,/do not need to fill out each scene/);
});
test('locked plan offers existing safe revision action without generation or overwrite',async t=>{
 const f=await mount(t,{locked:true});assert.equal(f.button('Prepare all 50 scenes for me'),undefined);await f.click(f.button('Make an editable copy'));assert.equal(f.revised(),1);assert.equal(f.calls.length,0);assert.equal(f.saves.length,0);
});

test('beginner must prepare renderable short shots before requesting whole-song AI directions',async t=>{
 const f=await mount(t,{longShots:true});
 assert.match(document.body.textContent,/Make short shots first/);
 assert.equal(f.button('Prepare all 50 scenes for me').disabled,true);
 assert.equal(f.calls.length,0);
 await f.click(f.button('Make 5-second shots first'));
 assert.equal(f.shortened(),1);
 assert.equal(f.calls.length,0);
 assert.equal(f.saves.length,0);
});
