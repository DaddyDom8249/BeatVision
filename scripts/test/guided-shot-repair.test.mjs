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
const {diagnoseShot,readSceneDirections,proposeSceneRepairs,saveShotRepairs}=await import(pathToFileURL(join(dir,'engine.mjs'))),Help=(await import(pathToFileURL(join(dir,'help.mjs')))).default;
after(()=>rm(dir,{recursive:true,force:true}));
const scenes=()=>[
 {id:'shot-1',scene_number:1,title:'Kitchen',movement_direction:'subtle gestures, restrained',camera_direction:'Slow camera push-in.',visual_direction:JSON.stringify({action:'She lifts the saved coffee cup.'}),status:'draft',start_time:0,end_time:5,location:'Kitchen',continuity_notes:'Keep wardrobe'},
 {id:'shot-2',scene_number:2,title:'Doorway',movement_direction:'He holds the door open.',camera_direction:'Slow',visual_direction:'Approved doorway.',status:'draft',start_time:5,end_time:10,location:'Doorway',continuity_notes:'Keep wardrobe'},
 {id:'shot-3',scene_number:3,title:'Empty room',movement_direction:'subtle',camera_direction:'Slow',visual_direction:'An empty bedroom.',status:'draft',start_time:10,end_time:15,location:'Bedroom',continuity_notes:'No people'},
 {id:'shot-4',scene_number:4,title:'Valid',movement_direction:'The light flickers softly.',camera_direction:'Keep camera fixed.',visual_direction:'Lamp.',status:'draft',start_time:15,end_time:20,location:'Bedroom',continuity_notes:'Keep lamp'},
];
test('each diagnosis isolates the broken field and draws action choices only from that scene',()=>{
 const [one,two,three,four]=scenes().map(diagnoseShot);
 assert.ok(one.issues.actor);assert.equal(one.issues.camera,'');assert.deepEqual(one.actionOptions,['She lifts the saved coffee cup.']);
 assert.equal(two.issues.actor,'');assert.ok(two.issues.camera);assert.equal(three.actionOptions.length,0);assert.equal(four.needsAttention,false);
 assert.equal(diagnoseShot({...scenes()[0],visual_direction:'Sad rain in an empty room'}).actionOptions.length,0);
});
test('different scene fixes preserve valid fields and leave untouched shots and media alone',()=>{
 const source=scenes(),before=structuredClone(source);
 const repairs=proposeSceneRepairs(source,{'shot-1':{...readSceneDirections(source[0]),actor:'She lifts the saved coffee cup.'},'shot-2':{...readSceneDirections(source[1]),camera:'Keep the camera fixed. No zoom.'}});
 assert.equal(repairs.length,2);assert.equal(repairs[0].camera,source[0].camera_direction);assert.equal(repairs[1].actor,source[1].movement_direction);
 assert.notEqual(repairs[0].actor,repairs[1].actor);assert.deepEqual(source,before);assert.ok(!repairs.some(x=>['shot-3','shot-4'].includes(x.scene_id)));
 assert.throws(()=>proposeSceneRepairs(source,{'shot-3':readSceneDirections(source[2]) ,ghost:{actor:'Unknown action.',camera:'Fixed camera.'}}),/shot list changed/);
});
test('structured and escaped action directions retain exact negatives and camera fallback',()=>{
 const shot={...scenes()[0],movement_direction:JSON.stringify(JSON.stringify({actor:'Keep the head still. Do not walk or run.'})),camera_direction:JSON.stringify({camera_movement:'Camera pans left.'})};
 const d=diagnoseShot(shot);assert.equal(d.directions.actor,'Keep the head still. Do not walk or run.');assert.equal(d.directions.camera,'Camera pans left.');
 assert.ok(!d.actionOptions.includes('run.'));assert.equal(d.needsAttention,false);
 const alternatives=diagnoseShot({...shot,movement_direction:'Raise the left hand or lower the right hand.'});
 assert.ok(alternatives.actionOptions.includes('Raise the left hand'));assert.ok(alternatives.actionOptions.includes('lower the right hand.'));
});
test('scene fixes fail closed on vague, missing, ambiguous or overlong text',()=>{
 for(const edit of [{actor:'subtle',camera:'Fixed camera.'},{actor:'Walk or dance.',camera:'Fixed camera.'},{actor:'A'.repeat(201),camera:'Fixed camera.'},{actor:'Raise the left hand.',camera:''},{actor:'Raise the left hand.',camera:'Slow'}])
  assert.throws(()=>proposeSceneRepairs(scenes(),{'shot-1':edit}),/Scene 1:/);
});
test('55 distinct edits can be reviewed and saved once without copying directions between shots',async()=>{
 const source=Array.from({length:55},(_,i)=>({...scenes()[0],id:'s'+i,scene_number:i+1}));
 const edits=Object.fromEntries(source.map((scene,i)=>[scene.id,{actor:`Hold the approved object for shot ${i+1}.`,camera:scene.camera_direction}]));
 const proposals=proposeSceneRepairs(source,edits),calls=[];
 assert.equal(new Set(proposals.map(x=>x.actor)).size,55);
 assert.equal(await saveShotRepairs({rpc:async(name,args)=>{calls.push({name,args});return {data:55,error:null};}},'draft',proposals),55);
 assert.equal(calls.length,1);assert.equal(calls[0].name,'save_guided_shot_directions');assert.equal(calls[0].args.p_repairs.length,55);
 assert.deepEqual(Object.keys(calls[0].args.p_repairs[0]).sort(),['scene_id','expected_movement_direction','expected_camera_direction','actor','camera'].sort());
 await assert.rejects(saveShotRepairs({rpc:async()=>({error:{message:'GUIDED_REPAIR_STALE'}})},'draft',proposals),/Nothing was saved/);
});
async function mount({locked=false,error=null,source=scenes()}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test/projects/p/visual-plan?plan=v&help=directions'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const calls=[];let saved=0,revised=0;globalThis.__guidedDb={rpc:async(name,args)=>{calls.push({name,args});return {data:error?null:args.p_repairs.length,error};}};
 const root=createRoot(document.getElementById('root'));
 await act(async()=>root.render(React.createElement(Help,{planId:'v',locked,scenes:source,working:false,onSaved:async()=>{saved++;},onCreateRevision:async()=>{revised++;}})));
 const button=text=>[...document.querySelectorAll('button')].find(x=>x.textContent===text);
 const click=async el=>{assert.ok(el);await act(async()=>el.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));};
 return {calls,button,click,saved:()=>saved,revised:()=>revised,cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.__guidedDb;}};
}
test('beginner flow fixes two different scene problems and saves only reviewed scene-specific edits',async()=>{
 const f=await mount();try{
 assert.match(document.body.textContent,/3 shots need clearer direction/);assert.equal(f.calls.length,0);
 await f.click(f.button('Use saved action: She lifts the saved coffee cup.'));await f.click(f.button('Next scene'));
 assert.equal(document.querySelector('textarea').value,'He holds the door open.');
 await f.click(f.button('Keep the camera still'));await f.click(f.button('Preview scene-specific fixes'));
 assert.match(document.body.textContent,/After action: She lifts the saved coffee cup/);assert.match(document.body.textContent,/After action: He holds the door open/);
 assert.equal(f.button('Save fixes to 2 draft shots').disabled,true);
 await f.click([...document.querySelectorAll('label')].find(x=>x.textContent.includes('I reviewed each'))?.querySelector('input'));
 await f.click(f.button('Save fixes to 2 draft shots'));assert.equal(f.calls.length,1);assert.equal(f.saved(),1);
 assert.deepEqual(f.calls[0].args.p_repairs.map(x=>x.scene_id),['shot-1','shot-2']);assert.match(document.body.textContent,/No render was started/);
 }finally{await f.cleanup();}
});
test('navigating preserves edits, changing a scene clears prior review, discard touches only that scene',async()=>{
 const f=await mount();try{
 await f.click(f.button('Use saved action: She lifts the saved coffee cup.'));await f.click(f.button('Preview scene-specific fixes'));
 assert.ok(f.button('Save fixes to 1 draft shots'));
 await f.click(f.button('Next scene'));await f.click(f.button('Keep the camera still'));
 assert.equal(f.button('Save fixes to 1 draft shots'),undefined);
 await f.click(f.button('Previous scene'));assert.equal(document.querySelector('textarea').value,'She lifts the saved coffee cup.');
 await f.click(f.button('Discard this scene’s edit'));assert.equal(document.querySelector('textarea').value,'subtle gestures, restrained');
 await f.click(f.button('Preview scene-specific fixes'));assert.ok(f.button('Save fixes to 1 draft shots'));assert.equal(f.calls.length,0);
 }finally{await f.cleanup();}
});
test('locked help preserves revision boundary; passing repeated shots can still be individually reviewed',async()=>{
 let f=await mount({locked:true});try{assert.equal(document.querySelectorAll('textarea').length,0);await f.click(f.button('Make an editable copy for these fixes'));assert.equal(f.revised(),1);assert.equal(f.calls.length,0);}finally{await f.cleanup();}
 f=await mount({source:[scenes()[3],{...scenes()[3],id:'repeat',scene_number:5}]});try{assert.match(document.body.textContent,/same action and camera are saved on 2 shots/);assert.match(document.body.textContent,/Review each shot/);assert.equal(f.calls.length,0);}finally{await f.cleanup();}
});

test('explicit per-shot action and camera arrays offer the saved choices without auto-selecting',()=>{
 const shot={...scenes()[0],visual_direction:'Saved subject in the room.',movement_direction:JSON.stringify({actor:['Raise the left hand.','Lower the right hand.'],camera:['Camera pans left.','Camera pans right.']})};
 const d=diagnoseShot(shot);assert.equal(d.needsAttention,true);assert.equal(d.directions.actor,'');assert.equal(d.directions.camera,'');
 assert.deepEqual(d.actionOptions,['Raise the left hand.','Lower the right hand.']);assert.deepEqual(d.cameraOptions,['Camera pans left.','Camera pans right.']);
});
