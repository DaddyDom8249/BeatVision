import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import ts from 'typescript';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
const rootDir=fileURLToPath(new URL('../../',import.meta.url)),dir=await mkdtemp(join(rootDir,'.guided-test-'));
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const read=path=>readFile(join(rootDir,path),'utf8');
await writeFile(join(dir,'shot.mjs'),compile(await read('supabase/functions/beatvision-generation/shot-direction.ts')));
await writeFile(join(dir,'engine.mjs'),compile((await read('src/lib/guidedShotRepair.ts')).replace('"../../supabase/functions/beatvision-generation/shot-direction"','"./shot.mjs"')));
await writeFile(join(dir,'stub.mjs'),'export const supabase={rpc:(...args)=>globalThis.__guidedDb.rpc(...args)};');
await writeFile(join(dir,'help.mjs'),compile((await read('src/components/plan/BeginnerShotHelp.tsx')).replace('"../../lib/supabase/client"','"./stub.mjs"').replace('"../../../supabase/functions/beatvision-generation/shot-direction"','"./shot.mjs"').replace('"../../lib/guidedShotRepair"','"./engine.mjs"')));
const {proposeShotRepairs,saveShotRepairs}=await import(pathToFileURL(join(dir,'engine.mjs'))),Help=(await import(pathToFileURL(join(dir,'help.mjs')))).default;
after(()=>rm(dir,{recursive:true,force:true}));
const scenes=()=>Array.from({length:56},(_,i)=>({id:'shot-'+i,scene_number:i+1,title:'Saved shot '+i,movement_direction:i===55?'Lift the left hand slowly.':'subtle gestures, restrained',camera_direction:'Slow',status:'draft',start_time:i*5,end_time:(i+1)*5,location:'Approved location',continuity_notes:'Keep wardrobe'}));
const choices={action:'breathe',customAction:'',camera:'locked',customCamera:''};
test('55affectedshots get only explicitly chosen directions and the valid shot is preserved',()=>{
 const source=scenes(),snapshot=structuredClone(source),proposal=proposeShotRepairs(source,choices);
 assert.equal(proposal.length,55);assert.deepEqual(source,snapshot);assert.ok(proposal.every(x=>x.actor.includes('breathes gently')));
 assert.ok(proposal.every(x=>x.expected_movement_direction==='subtle gestures, restrained'));
 assert.ok(!proposal.some(x=>x.scene_id==='shot-55'));assert.doesNotMatch(proposal[0].prompt,/new character|rain|city|wardrobe change/);
});
test('custom direction remains literal and passes the same renderer check',()=>{
 const proposal=proposeShotRepairs(scenes(),{action:'custom',customAction:'Lift only the right hand. Keep the head still.',camera:'custom',customCamera:'Camera remains fixed. No zoom.'});
 assert.equal(proposal[0].actor,'Lift only the right hand. Keep the head still.');assert.match(proposal[0].prompt,/No zoom/);
 for(const invalid of [{...choices,action:''},{...choices,action:'still'},{...choices,action:'custom',customAction:'walk or dance'}])assert.throws(()=>proposeShotRepairs(scenes(),invalid));
});
test('save makes one atomic draft RPC, carries stale-write guards, and never approves or generates',async()=>{
 const calls=[],proposal=proposeShotRepairs(scenes(),choices);
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:55,error:null};}};
 assert.equal(await saveShotRepairs(db,'draft-plan',proposal),55);assert.equal(calls.length,1);assert.equal(calls[0].name,'save_guided_shot_directions');assert.equal(calls[0].args.p_repairs.length,55);
 assert.deepEqual(Object.keys(calls[0].args.p_repairs[0]).sort(),['scene_id','expected_movement_direction','expected_camera_direction','actor','camera'].sort());
 await assert.rejects(saveShotRepairs({rpc:async()=>({error:{message:'GUIDED_REPAIR_STALE'}})},'p',proposal),/Nothing was saved/);
});
async function mount({locked=false,error=null}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test/projects/p/visual-plan?plan=v&help=directions'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const calls=[];let saved=0,revised=0;globalThis.__guidedDb={rpc:async(name,args)=>{calls.push({name,args});return {data:error?null:args.p_repairs.length,error};}};
 const root=createRoot(document.getElementById('root'));const source=scenes();
 await act(async()=>root.render(React.createElement(Help,{planId:'v',locked,scenes:source,working:false,onSaved:async()=>{saved++;},onCreateRevision:async()=>{revised++;}})));
 const button=text=>[...document.querySelectorAll('button')].find(x=>x.textContent===text);
 const click=async el=>{assert.ok(el);await act(async()=>el.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));};
 const choose=async text=>click([...document.querySelectorAll('label')].find(x=>x.textContent.trim()===text)?.querySelector('input'));
 return {calls,button,click,choose,saved:()=>saved,revised:()=>revised,cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.__guidedDb;}};
}
test('beginner flow explains55issues, previews choices and requires explicit reviewed save',async()=>{
 const f=await mount();try{
 assert.match(document.body.textContent,/55 shots need clearer direction/);assert.equal(f.calls.length,0);
 await f.choose('Gentle breathing · person or animal');await f.choose('Keep the camera still');await f.click(f.button('Preview proposed fixes'));
 assert.match(document.body.textContent,/Action: The existing subject breathes gently/);assert.equal(f.button('Save fixes to 55 draft shots').disabled,true);
 await f.click(document.querySelector('input[type=checkbox]'));await f.click(f.button('Save fixes to 55 draft shots'));
 assert.equal(f.calls.length,1);assert.equal(f.saved(),1);assert.match(document.body.textContent,/No render was started/);
 }finally{await f.cleanup();}
});
test('locked-plan help offers an editable copy without editing or approving the locked scenes',async()=>{
 const f=await mount({locked:true});try{
 assert.equal(document.querySelectorAll('input[type=radio]').length,0);
 await f.click(f.button('Make an editable copy for these fixes'));assert.equal(f.revised(),1);assert.equal(f.calls.length,0);
 }finally{await f.cleanup();}
});
test('switching choices invalidates the previous proposal and confirmation',async()=>{
 const f=await mount();try{
 await f.choose('Gentle breathing · person or animal');await f.choose('Keep the camera still');await f.click(f.button('Preview proposed fixes'));
 await f.click(document.querySelector('input[type=checkbox]'));await f.choose('Small head turn · person or animal');
 assert.equal(f.button('Save fixes to 55 draft shots'),undefined);assert.equal(f.calls.length,0);
 await f.choose('Write my own action');assert.ok(document.querySelector('textarea'));assert.equal(f.calls.length,0);
 }finally{await f.cleanup();}
});
