import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const dir = await mkdtemp(join(rootDir, '.ui-test-'));
const source = await readFile(new URL('../../src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
const transformed = ts.transpileModule(source.replace('"../lib/supabase/client"', '"./stub.mjs"').replace('"../lib/formatCreativeText"', '"./formatCreativeText.mjs"'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
await writeFile(join(dir, 'page.mjs'), transformed);
const errorHelper = await readFile(new URL('../../src/lib/formatCreativeText.ts', import.meta.url), 'utf8');
await writeFile(join(dir, 'formatCreativeText.mjs'), ts.transpileModule(errorHelper, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
await writeFile(join(dir, 'stub.mjs'), 'export const supabase = new Proxy({}, { get: (_, key) => globalThis.__uiDb[key] });');
const Page = (await import(pathToFileURL(join(dir, 'page.mjs')).href)).default;
after(() => rm(dir, { recursive: true, force: true }));


async function mount({authError=null,projectError=null,rejectAuth=false}={}) {
 const dom=new JSDOM('<div id="root"></div>',{url:'https://beat-vision-theta.vercel.app'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 let requests=0,fail=projectError;
 globalThis.__uiDb={
  auth:{getUser:async()=>{if(rejectAuth)throw new Error('Authentication transport unavailable');return {data:{user:{id:'user-1'}},error:authError}}},
  from(){requests++;const q={select(){return this},eq(){return this},order(){return this},limit:async()=>({data:fail?null:[{id:'project-1',title:'Ghast',status:'Draft'}],error:fail})};return q}
 };
 const root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(Page,{onNavigate:()=>{}}))});
 return{
  get requests(){return requests},
  retry:async()=>{fail=null;const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='Retry loading projects');assert.ok(b);await act(async()=>b.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))},
  cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.__uiDb}
 };
}
test('database failure does not falsely say the owner has no projects',async()=>{
 const view=await mount({projectError:{message:'Database unavailable'}});
 try{assert.match(document.querySelector('[role="alert"]')?.textContent??'',/Database unavailable/);assert.doesNotMatch(document.body.textContent,/Your first world starts/)}finally{await view.cleanup()}
});
test('retry recovers the existing project list after a database error',async()=>{
 const view=await mount({projectError:{message:'Temporary network failure'}});
 try{await view.retry();assert.match(document.body.textContent,/Ghast/);assert.equal(view.requests,2);assert.equal(document.querySelector('[role="alert"]'),null)}finally{await view.cleanup()}
});
test('auth service error is surfaced without querying projects',async()=>{
 const view=await mount({authError:{message:'Session validation unavailable'}});
 try{assert.match(document.querySelector('[role="alert"]')?.textContent??'',/Session validation unavailable/);assert.equal(view.requests,0)}finally{await view.cleanup()}
});
