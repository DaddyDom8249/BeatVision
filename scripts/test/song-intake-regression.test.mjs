import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

const analysisSource = readFileSync(new URL('../../src/lib/musicAnalysis.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(analysisSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

test('local analysis emits only positive contiguous sections through exact duration', async () => {
  const samples = new Float32Array(3064987);
  const module = { exports: {} };
  runInNewContext(compiled, { module, exports: module.exports, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
    AudioContext: class { async decodeAudioData() { return { duration: samples.length / 8000, sampleRate: 8000, numberOfChannels: 1, getChannelData: () => samples }; } async close() {} } });
  const result = await module.exports.analyzeAudioLocally('https://fixture.test/short.wav');
  assert.equal(result.sections[0].start_time, 0);
  assert.equal(result.sections.at(-1).end_time, result.duration_seconds);
  for (const section of result.sections) assert.ok(section.end_time > section.start_time, JSON.stringify(section));
});

test('song intake separates analysis state and protects unsaved creator fields on analysis refresh', () => {
  const source = readFileSync(new URL('../../src/pages/SongPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /const \[analyzing, setAnalyzing\] = useState\(false\)/);
  assert.match(source, /if \(saving \|\| analyzing/);
  assert.match(source, /setAnalyzing\(true\)/);
  assert.match(source, /setAnalyzing\(false\)/);
  assert.doesNotMatch(source, /\}, \[song\]\);/);
  assert.match(source, /\[song\?\.id, song\?\.title, song\?\.artist, song\?\.lyrics, song\?\.creative_direction, song\?\.notes, song\?\.visual_style_preferences\]/);
});

function worldContinueButton({ confirmed = false, dirty = false } = {}) {
  const song = { id:'song',project_id:'project',title:dirty?'unsaved fixture title':'',artist:'',
    audio_path:'fixture/song.wav',analysis_status:'completed',analysis:{duration_seconds:16} };
  const page = readFileSync(new URL('../../src/pages/SongPage.tsx',import.meta.url),'utf8');
  const code = ts.transpileModule(page,{compilerOptions:{target:ts.ScriptTarget.ES2022,
    module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod={exports:{}};
  runInNewContext(code,{module:mod,exports:mod.exports,require(name){
    if(name==='react') return React;
    if(name==='react/jsx-runtime') return jsxRuntime;
    if(name==='../hooks/useProject') return {useProject:()=>({project:{id:'project',title:'Fixture'},loading:false})};
    if(name==='../hooks/useSong') return {useSong:()=>({song,loading:false,schemaReady:true,reload:async()=>{}})};
    if(name==='../hooks/useSongInterpretation') return {useSongInterpretation:()=>({confirmed:confirmed?{id:'confirmed-interpretation'}:null})};
    if(name.startsWith('../components/')) return {default:()=>null};
    if(name==='../lib/supabase/client') return {supabase:{}};
    if(name==='../lib/musicAnalysis') return {analyzeAudioLocally:async()=>{throw Error('not invoked');}};
    if(name==='../lib/errorDetails') return {formatFailure:()=>''};
    throw Error('Unexpected dependency '+name);
  }});
  const doc=new JSDOM(renderToStaticMarkup(React.createElement(mod.exports.default,{projectId:'project'}))).window.document;
  const button=[...doc.querySelectorAll('button')].find(node=>node.textContent.includes('Continue to World Reveal'));
  assert.ok(button,'completed analysis must explain the next step');
  return button;
}
test('completed analysis cannot continue without a confirmed interpretation',()=>{
  assert.equal(worldContinueButton().disabled,true);
});
test('confirmed interpretation enables Continue only while song edits are saved',()=>{
  assert.equal(worldContinueButton({confirmed:true}).disabled,false);
  assert.equal(worldContinueButton({confirmed:true,dirty:true}).disabled,true);
});
