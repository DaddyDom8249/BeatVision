import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
const req=createRequire(import.meta.url);
function load(path, overrides = {}){
 const filename=resolve(path), target={exports:{}};
 const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{module:target,exports:target.exports,require:(id)=>overrides[id] ?? (id.startsWith('.')?load(resolve(dirname(filename),id)+(id.includes('AssetList')?'.tsx':'.ts')):req(id)),console});
 return target.exports;
}
test('sparse World produces every editable creative field and preserves creator and approved text',()=>{
 const {completeWorldDraft,suggestMissingWorldFields}=load('src/lib/style/worldSheetSuggestions.ts');
 const world={environments:['night street'],atmosphere:'reflective',continuity_rules:['same wardrobe']};
 for(const kind of ['character','environment']){
  const sheet=suggestMissingWorldFields({},world,kind,'night street','draft').sheet;
  assert.equal(Object.keys(sheet).length,kind==='character'?5:7);
  assert.ok(Object.values(sheet).every(v=>v.trim()));
 }
 assert.equal(suggestMissingWorldFields({appearance:'creator'},world,'character','Central Figure','draft').sheet.appearance,'creator');
 assert.equal(suggestMissingWorldFields({appearance:''},world,'character','Central Figure','approved').sheet.appearance,'');
});
for(const kind of ['Character','Environment']) test(`${kind} save stays editable, cancel and Undo Last Save restore values; revision preserves approval`,async()=>{
 const dom=new JSDOM('<div id="root"></div>');
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const Editor=load(`src/components/style/${kind}Editor.tsx`).default;
 const field=kind==='Character'?'identity':'purpose';
 let row={id:'a',name:'Original',sheet:{[field]:'saved',lighting:'Creative proposal: light'},persisted_sheet:{[field]:'saved',nested:{palette:['red','blue']}},status:'draft',updated_at:'1',revision_number:1};
 const saves=[], revisions=[]; const root=createRoot(document.getElementById('root'));
 const render=()=>root.render(React.createElement(Editor,{[kind.toLowerCase()]:row,assets:[],working:false,onSave:async(id,input)=>{saves.push(input);row={...row,name:input.name,sheet:input.restoreSheet??input.sheet,persisted_sheet:input.restoreSheet??input.sheet,updated_at:String(Number(row.updated_at)+1)};render();return row;},onCreateRevision:async(r,p)=>revisions.push([r,p]),onGenerate:async()=>({}),onUpload:async()=>{},onApprove:async()=>{},onApproveAsset:async()=>{}}));
 const button=(text)=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 await act(async()=>render());
 // Exercise the mounted component's real React change handler.
 const input=document.querySelector('textarea');
 const props=input[Object.keys(input).find(k=>k.startsWith('__reactProps'))];
 await act(async()=>props.onChange({target:{value:'changed'}}));
 await act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(saves[0].sheet[field],'changed');assert.equal(document.querySelector('textarea').readOnly,false);
 await act(async()=>button('Undo Last Save').click());assert.equal(saves[1].sheet[field],'saved');assert.deepEqual(saves[1].restoreSheet,{[field]:'saved',nested:{palette:['red','blue']}});assert.equal(saves[1].expectedUpdatedAt,'2');
 const input2=document.querySelector('textarea');await act(async()=>input2[Object.keys(input2).find(k=>k.startsWith('__reactProps'))].onChange({target:{value:'cancel me'}}));
 await act(async()=>button('Cancel Changes').click());assert.equal(document.querySelector('textarea').value,'saved');assert.equal(saves.length,2);
 await act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
 assert.ok(button('Undo Last Save')); row={...row,updated_at:'999'}; await act(async()=>render());assert.equal(button('Undo Last Save'),undefined);
 row={...row,status:'approved'};await act(async()=>render());assert.equal(document.querySelector('textarea').readOnly,true);
 await act(async()=>button('Create Editable Revision').click());assert.equal(revisions.length,1);assert.equal(revisions[0][0].status,'approved');assert.equal(saves.length,3);
 await act(async()=>root.unmount());dom.window.close();
});

test('initial materialization preserves explicit environment fields and fills sparse records',()=>{
 const source=readFileSync('src/hooks/useStyleStudio.ts','utf8');
 const target={exports:{}};
 const code=ts.transpileModule(source+'\nexport { materializeWorldDrafts };',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{module:target,exports:target.exports,require:(id)=>id.includes('supabase')?{supabase:{}}:id==='react'?React:load(resolve('src/hooks',id)+'.ts')});
 const world={id:'w',environments:[{setting:'room',purpose:'Creator purpose',layout:'Creator layout',lighting:'Red window',atmosphere:'Smoke',continuity:'Door stays left'}]};
 const rows=target.exports.materializeWorldDrafts(world,'p','s');
 const env=rows.environments[0].sheet;
 assert.equal(env.purpose,'Creator purpose');assert.equal(env.layout,'Creator layout');assert.equal(env.lighting,'Red window');assert.equal(env.atmosphere,'Smoke');assert.ok(env.continuity.includes('Door stays left'));
 assert.ok(Object.values(env).every(v=>v.trim()));assert.ok(Object.values(rows.characters[0].sheet).every(v=>v.trim()));
});
test('generation replaces unchanged fallback proposals, preserving creator text',()=>{
 const {mergeGeneratedStyleDraft}=load('src/lib/style/generatedStyleDraft.ts');
 const result=mergeGeneratedStyleDraft({appearance:'Creative proposal: silhouette',wardrobe:'Creator coat'},{appearance:'Generated appearance',wardrobe:'Generated coat'},'character',['appearance']);
 assert.equal(result.appearance,'Generated appearance');assert.equal(result.wardrobe,'Creator coat');
});
for (const kind of ['Character','Environment']) test(`${kind} actual save uses version/project/draft filters and restores exact JSON`,async()=>{
 const source=readFileSync('src/hooks/useStyleStudio.ts','utf8');
 const name='save'+kind, rows=kind.toLowerCase()==='character'?'characters':'environments';
 const start=source.indexOf(`const ${name} = useCallback(`)+`const ${name} = useCallback(`.length;
 const end=source.indexOf(`  }, [projectId, world, styleBible, ${rows}, load]);`,start)+3;
 const callback=source.slice(start,end);
 const target={exports:{}};let saved=null,loads=0;let actualVersion='v2';const filters=[];
 const original={identity:{traits:['quiet','steady']},nested:{palette:['red']}};
 const supabase={from(table){assert.equal(table,rows);return {update(payload){saved=payload;filters.length=0;const q={eq(k,v){filters.push([k,v]);return q;},select(){return q;},async single(){return {data:actualVersion===filters.find(([k])=>k==='updated_at')?.[1]?{id:'row',updated_at:'v3'}:null,error:actualVersion===filters.find(([k])=>k==='updated_at')?.[1]?null:{code:'PGRST116',message:'No matching version'}};}};return q;}};}};
 const rawName=kind==='Character'?'rawCharacterSheets':'rawEnvironmentSheets';
 const context={module:target,exports:target.exports,supabase,world:{id:'world'},projectId:'project',styleBible:{id:'style'},[rows]:[{id:'row',status:'draft',updated_at:'v2'}],[rawName]:{current:new Map([['row',original]])},[kind==='Character'?'characterFields':'environmentFields']:'id,updated_at',setWorking:()=>{},setError:()=>{},load:async()=>loads++,mergeCreativeSheet:load('src/lib/formatCreativeText.ts').mergeCreativeSheet,getCreativeErrorMessage:load('src/lib/formatCreativeText.ts').getCreativeErrorMessage};
 const code=ts.transpileModule(`export const save = ${callback};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;runInNewContext(code,context);
 await target.exports.save('row',{name:'Restored',sheet:{identity:'formatted'},restoreSheet:original,expectedUpdatedAt:'v2'});
 assert.equal(saved.sheet,original);assert.ok(filters.some(([k,v])=>k==='project_id'&&v==='project'));assert.ok(filters.some(([k,v])=>k==='status'&&v==='draft'));assert.equal(loads,1);
 actualVersion='v4';await assert.rejects(target.exports.save('row',{name:'Old',sheet:{},restoreSheet:original,expectedUpdatedAt:'v2'}),e=>e.code==='PGRST116');assert.equal(loads,1);
 await assert.rejects(target.exports.save('row',{name:'Invalid restore',sheet:{},restoreSheet:original}),/requires its saved version/);
});
