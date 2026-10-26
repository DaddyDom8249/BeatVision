import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import React,{act} from 'react';
import * as jsx from 'react/jsx-runtime';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import * as direction from '../../supabase/functions/beatvision-generation/shot-direction.ts';
const scene={id:'scene',project_id:'project',visual_plan_id:'plan',scene_number:1,status:'draft',updated_at:'version1',start_time:0,end_time:5};
const proposal={mode:'literal',lyric_excerpt:'The phone rings.',action:'The phone vibrates as the figure hesitates, shoulders tense with dread.',objects:['phone'],emotion:'dread',visual_direction:'Visible phone beside the approved figure, tense expression and cold lighting.',camera:'Camera holds still.',meaning:'Dread of answering.',uncertainty:'Proposed interpretation for review.'};
async function fixture(t,{locked=false,defer=false,failure=false}={}){
 const dom=new JSDOM('<div id="root"></div>'),previous={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const calls=[],applied=[];let resolve;
 const response={data:{scene_proposal:proposal,scene_id:'scene',expected_updated_at:'version1',timing:{source:'transcript_segments',precision:'Exact word sync unverified.'}},error:null};
 const supabase={functions:{invoke:async(name,args)=>{calls.push({name,args});if(defer)return new Promise(r=>resolve=r);return failure?{data:null,error:{context:new Response(JSON.stringify({error:{message:'Free allocation unavailable.'}}))}}:structuredClone(response);}}};
 const mod={exports:{}};runInNewContext(ts.transpileModule(readFileSync(new URL('../../src/components/plan/LyricSceneHelp.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,Response,require(name){if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;if(name.includes('/supabase/client'))return {supabase};if(name.includes('/shot-direction'))return direction;throw Error(name);}});
 const root=createRoot(document.getElementById('root')),Component=mod.exports.default;
 const render=async(overrides={})=>act(async()=>root.render(React.createElement(Component,{scene:{...scene,status:locked?'approved':'draft'},lyrics:'The phone rings.',disabled:false,onApply:changes=>applied.push(changes),...overrides})));
 await render();const button=text=>[...document.querySelectorAll('button')].find(x=>x.textContent===text);
 const click=async(el)=>{assert.ok(el);await act(async()=>el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));};
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,previous);});
 await click(button('Match this scene to its lyrics'));
 return {button,click,calls,applied,render,response,resolve:async()=>act(async()=>resolve(structuredClone(response)))};
}
test('reviewed lyric proposal carries phone, emotion and exact action into existing image/motion fields without auto-saving',async t=>{
 const f=await fixture(t);assert.equal(f.calls.length,0);await f.click(f.button('Propose lyric-specific scene'));
 assert.equal(f.calls.length,1);assert.equal(f.applied.length,0);assert.match(document.body.textContent,/Must show: phone/);
 assert.match(document.body.textContent,/Emotion: dread/);assert.match(document.body.textContent,/Machine transcript timing estimate/);
 await f.click(f.button('Use proposal in editable fields'));assert.equal(f.applied.length,1);
 const fields=f.applied[0];assert.equal(fields.lyric_moment,proposal.lyric_excerpt);assert.match(fields.visual_direction,/Must show: phone/);assert.equal(fields.mood,'dread');
 assert.match(direction.buildModalShotPrompt(fields),/phone vibrates.*dread/);assert.equal(f.calls.length,1);
 assert.equal(fields.status,undefined);assert.equal(fields.start_time,undefined);assert.equal(fields.continuity_notes,undefined);
});
test('locked plans never submit and provider failure leaves saved scene alone',async t=>{
 let f=await fixture(t,{locked:true});assert.equal(f.button('Propose lyric-specific scene').closest('fieldset').disabled,true);assert.equal(f.calls.length,0);
});
test('provider error message is shown without applying a proposal',async t=>{
 const f=await fixture(t,{failure:true});await f.click(f.button('Propose lyric-specific scene'));assert.match(document.body.textContent,/Free allocation unavailable/);assert.equal(f.applied.length,0);
});
test('stale scene response is discarded after scene identity changes',async t=>{
 const f=await fixture(t,{defer:true});await f.click(f.button('Propose lyric-specific scene'));
 await f.render({scene:{...scene,id:'other',updated_at:'version2'}});await f.resolve();assert.equal(f.applied.length,0);assert.equal(f.button('Use proposal in editable fields'),undefined);
});

test('actual deployed-controller snapshot passes reviewed lyric visuals to the image bridge unchanged',async()=>{
 const {loadGeneration}=await import('./generation-runtime.mjs');
 const source=new URL('../../docs/releases/2026-10-26/runtime/beatvision-generation/index.ts',import.meta.url);
 const runtime=await loadGeneration({}, {},source);
 try{
 const saved={...scene,visual_direction:proposal.visual_direction+' Must show: phone.',movement_direction:JSON.stringify({actor:proposal.action,camera:proposal.camera}),mood:proposal.emotion,lyric_moment:proposal.lyric_excerpt};
 const payload=await runtime.bridgePayload({}, {job_type:'scene_image',project_id:'project',vision_lock_id:'lock',input_snapshot:{scene:saved,vision_snapshot:{song:{analysis:{duration_seconds:10}},world:{},style_bible:{}}}});
 assert.deepEqual(payload.scene,saved);assert.match(payload.scene.visual_direction,/phone/);assert.equal(payload.scene.mood,'dread');
 }finally{await runtime.cleanup();}
});
