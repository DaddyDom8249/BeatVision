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
function load(path){
 const filename=resolve(path), target={exports:{}};
 const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{module:target,exports:target.exports,require:(id)=>id.startsWith('.')?load(resolve(dirname(filename),id)+(id.includes('AssetList')?'.tsx':'.ts')):req(id),console});
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
 let row={id:'a',name:'Original',sheet:{[field]:'saved'},status:'draft',updated_at:'1',revision_number:1};
 const saves=[], revisions=[]; const root=createRoot(document.getElementById('root'));
 const render=()=>root.render(React.createElement(Editor,{[kind.toLowerCase()]:row,assets:[],working:false,onSave:async(id,input)=>{saves.push(input);row={...row,...input,updated_at:String(Number(row.updated_at)+1)};render();},onCreateRevision:async(r,p)=>revisions.push([r,p]),onGenerate:async()=>({}),onUpload:async()=>{},onApprove:async()=>{},onApproveAsset:async()=>{}}));
 const button=(text)=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 await act(async()=>render());
 // Exercise the mounted component's real React change handler.
 const input=document.querySelector('textarea');
 const props=input[Object.keys(input).find(k=>k.startsWith('__reactProps'))];
 await act(async()=>props.onChange({target:{value:'changed'}}));
 await act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(saves[0].sheet[field],'changed');assert.equal(document.querySelector('textarea').readOnly,false);
 await act(async()=>button('Undo Last Save').click());assert.equal(saves[1].sheet[field],'saved');
 const input2=document.querySelector('textarea');await act(async()=>input2[Object.keys(input2).find(k=>k.startsWith('__reactProps'))].onChange({target:{value:'cancel me'}}));
 await act(async()=>button('Cancel Changes').click());assert.equal(document.querySelector('textarea').value,'saved');assert.equal(saves.length,2);
 row={...row,status:'approved'};await act(async()=>render());assert.equal(document.querySelector('textarea').readOnly,true);
 await act(async()=>button('Create Editable Revision').click());assert.equal(revisions.length,1);assert.equal(revisions[0][0].status,'approved');assert.equal(saves.length,2);
 await act(async()=>root.unmount());dom.window.close();
});
