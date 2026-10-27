import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
let version = '';
const chrome = [...new Set([process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean))]
  .find(path => {
    if (!existsSync(path)) return false;
    const v = spawnSync(path, ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (v.status !== 0 || !/(?:Google Chrome|Chromium) \d+\./.test(v.stdout)) return false;
    version = v.stdout.trim();
    return true;
  });

test('Director storyboard: Android-sized browser review, next shot and artist-only save without GPU or authentication', {
  skip: chrome ? false : 'Chromium not installed: Android-emulated UI NOT VERIFIED',
  timeout: 45000,
}, async t => {
  t.diagnostic('Read-only Chrome emulator: ' + version);
  const fixture = String.raw`import React from 'react';
import { createRoot } from 'react-dom/client';
import Storyboard from './src/components/plan/DirectorStoryboard.tsx';
const scenes = Array.from({length: 3}, (_, i) => ({
  id: 'scene-' + (i + 1), scene_number: i + 1, start_time: i * 5, end_time: (i + 1) * 5,
  visual_plan_id: 'plan', project_id: 'project', status: 'draft',
  title: 'Scene ' + (i + 1), lyric_moment: 'The phone rings again',
  visual_direction: 'A figure waiting beside the telephone under streetlights.',
  movement_direction: JSON.stringify({actor:'The figure lifts the telephone.',camera:'Camera holds still.'}),
  camera_direction: 'Camera holds still.', mood: 'Uneasy', location: 'Street',
  transition_style: 'Cut', continuity_notes: 'Use the same outfit.', updated_at:'v1',
}));
window.__fixtureSaved = [];
createRoot(document.getElementById('root')).render(
  React.createElement(Storyboard,{scenes,locked:false,working:false,onSave:async(id,changes)=>{
    window.__fixtureSaved.push({id,changes});
  }})
);`;
  const bundled = await build({
    stdin: { contents: fixture, resolveDir: rootDir, sourcefile:'director-fixture.tsx', loader:'tsx' },
    bundle:true, write:false, platform:'browser', format:'esm', jsx:'automatic',
  });
  const css = (await readFile(join(rootDir, 'src/styles.css'), 'utf8'))
    .replace(/^@import[^;]+;\s*/, '');
  const html = (await readFile(join(rootDir, 'index.html'), 'utf8'))
    .replace('<script type="module" src="/src/main.tsx"></script>',
      '<style>' + css + '</style><script type="module" src="/fixture.js"></script>');
  const server = createServer((req, res) => {
    res.writeHead(200,{ 'Content-Type':req.url==='/fixture.js'?'text/javascript':'text/html' });
    res.end(req.url==='/fixture.js'?bundled.outputFiles[0].text:html);
  });
  t.after(()=>server.close());
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const profile = await mkdtemp(join(tmpdir(),'bragora-director-mobile-'));
  const browser = spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--disable-background-networking','--no-first-run','--disable-sync','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank']);
  t.after(async()=>{if(browser.exitCode===null){browser.kill('SIGTERM');await new Promise(resolve=>browser.once('exit',resolve));}
    await rm(profile,{recursive:true,force:true,maxRetries:12,retryDelay:125});});
  const wsUrl = await new Promise((resolve,reject)=>{
    let output=''; const timer=setTimeout(()=>reject(new Error('Chrome startup timed out. '+output.slice(-1000))),10000);
    browser.once('error',e=>{clearTimeout(timer);reject(e)});
    browser.once('exit',c=>{clearTimeout(timer);reject(new Error('Chrome exited early: '+c))});
    browser.stderr.on('data',chunk=>{output=(output+chunk).slice(-8000);
      const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
  });
  const devPort=new URL(wsUrl).port;
  const pages=await(await fetch('http://127.0.0.1:'+devPort+'/json/list')).json();
  const socket=new WebSocket(pages.find(item=>item.type==='page').webSocketDebuggerUrl);
  t.after(()=>socket.close());
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  const pending=new Map();let id=0;
  socket.addEventListener('message',ev=>{const result=JSON.parse(ev.data),entry=pending.get(result.id);if(!entry)return;
    clearTimeout(entry.timer);pending.delete(result.id);if(result.error)entry.reject(new Error(JSON.stringify(result.error)));
    else entry.resolve(result.result);});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{
    const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(new Error('Timeout: '+method))},10000);
    pending.set(key,{resolve,reject,timer});socket.send(JSON.stringify({id:key,method,params}));
  });
  async function evaluate(expr) {
    const r=await cdp('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  await cdp('Network.enable');
  await cdp('Network.setBlockedURLs',{urls:['https://*','wss://*']});
  await cdp('Runtime.enable');
  await cdp('Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (Linux; Android 16; SM-S176V) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const results=[];
  for(const width of [390,980]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
    await cdp('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
    let ready=false;
    for(let n=0;n<100;n++){
      if(await evaluate("!!document.querySelector('.director-shot-card')")){ready=true;break;}
      await new Promise(r=>setTimeout(r,30));
    }
    assert.ok(ready,'The actual React DirectorStoryboard must render.');
    const state=await evaluate(String.raw`(()=>{
      const doc=document.documentElement,nav=document.querySelector('.director-storyboard-nav');
      const description=document.querySelector('.director-shot-description');
      return {innerWidth,scrollWidth:doc.scrollWidth,navWidth:nav.getBoundingClientRect().width,
        layout:getComputedStyle(description).gridTemplateColumns,
        sceneText:document.querySelector('.director-storyboard-counter').textContent,
        sceneCount:document.querySelectorAll('.director-shot-card').length,
        hasMedia:document.querySelectorAll('video,img').length,
        saveCount:window.__fixtureSaved.length};
    })()`);
    assert.equal(state.innerWidth,width);
    assert.equal(state.scrollWidth,width,'No horizontal scroll on mobile or desktop.');
    assert.match(state.sceneText,/Scene 1 of 3/);
    assert.equal(state.sceneCount,1,'Show one shot at a time.');
    assert.equal(state.hasMedia,0,'Text/storyboard only; do not represent rendered footage.');
    assert.equal(state.saveCount,0,'No silent creative writes.');
    const goNext=await evaluate(String.raw`(()=>{
      const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Next');
      button.click();return true;
    })()`);
    assert.ok(goNext);
    let scene2=false;
    for(let n=0;n<30;n++){
      if(await evaluate("/Scene 2 of 3/.test(document.querySelector('.director-storyboard-counter').textContent)")){scene2=true;break;}
      await new Promise(r=>setTimeout(r,30));
    }
    assert.ok(scene2,'Next must change visible scene without provider calls.');
    const open=await evaluate(String.raw`(()=>{
      const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Change this scene');
      b.click();return true;
    })()`);
    assert.ok(open);
    let textarea=false;
    for(let n=0;n<30;n++){
      if(await evaluate("!!document.querySelector('.director-shot-editor textarea')")){textarea=true;break;}
      await new Promise(r=>setTimeout(r,30));
    }
    assert.ok(textarea,'Plain-language director controls must expand.');
    const editing=await evaluate(String.raw`(()=>{
      const fields=document.querySelectorAll('.director-shot-editor textarea');
      return {count:fields.length,firstMax:fields[0].maxLength,
        editorWidth:fields[0].getBoundingClientRect().width};
    })()`);
    assert.equal(editing.count,3,'Visual, action, and camera editing.');
    assert.ok(editing.editorWidth>0,'Editable fields visible.');
    results.push({width,layout:state.layout,editorWidth:editing.editorWidth,
      noHorizontalScroll:state.scrollWidth===width,sceneNavigation:scene2});
  }
  // Mobile should have one-column scene cards; desktop two-column cards.
  assert.equal(results[0].layout.trim().split(/\s+/).length,1);
  assert.equal(results[1].layout.trim().split(/\s+/).length,2);
  t.diagnostic('Android-size + desktop layout evidence: '+JSON.stringify(results));
});
