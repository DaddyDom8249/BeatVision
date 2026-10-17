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

// Optional local browser regression: no cloud browser, credentials or providers.
// Run: node --test scripts/test/production-workspace-layout.test.mjs
// Prefer the runner-configured stable Chrome over a Chromium snapshot. A path
// can also be a distribution launcher; existence alone is not proof of usability.
let browserVersion = '';
const chromium = [...new Set([process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean))]
  .find(path => {
    if (!existsSync(path)) return false;
    const version = spawnSync(path, ['--version'], { encoding: 'utf8', timeout: 5_000 });
    if (version.status !== 0 || !/(?:Google Chrome|Chromium) \d+\./.test(version.stdout)) return false;
    browserVersion = version.stdout.trim();
    return true;
  });
const rootDir = fileURLToPath(new URL('../../', import.meta.url));

test('real workspace CSS compacts mobile scene navigation without changing desktop layout', {
  skip: chromium ? false : 'Local Chromium is not installed; browser layout is NOT VERIFIED.',
  timeout: 30_000,
}, async t => {
  t.diagnostic('Local browser: ' + chromium + ' (' + browserVersion + ')');
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import Page from './src/pages/ProductionWorkspacePage.tsx';
        createRoot(document.getElementById('root')).render(React.createElement(Page, {projectId:'fixture'}));`,
      resolveDir: rootDir, sourcefile: 'workspace-layout-fixture.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'esm', jsx: 'automatic',
    plugins: [{ name: 'read-only-layout-fixture', setup(b) {
      b.onResolve({ filter: /\/supabase\/client$/ }, () => ({ path: 'fixture', namespace: 'readonly' }));
      b.onLoad({ filter: /.*/, namespace: 'readonly' }, () => ({ loader: 'js', contents: `
        const scenes = Array.from({length:8}, (_, i) => ({
          id:'scene-'+(i+1),scene_number:i+1,start_time:i*10,end_time:(i+1)*10,
          title:'Section '+(i+1),status:'approved',location:'Warehouse',visual_direction:'Wide shot',
          camera_direction:'Slow pan',movement_direction:'Walking',mood:'Defiant',
          transition_style:'Cut',continuity_notes:'Same palette',lyric_moment:'Synthetic lyric'
        }));
        export const supabase = {
          auth:{getUser:async()=>({data:{user:{email:'synthetic-creator@fixture.test'}}})},
          from(table){return {
            select(){return this},eq(){return this},order(){return this},limit(){return this},
            single(){return this},maybeSingle(){return this},then(resolve){
              const data=table==='visual_plans'?{id:'plan-1',title:'Visual Plan',status:'approved'}
                :table==='visual_plan_scenes'?scenes
                :table==='scene_image_assets'||table==='motion_clip_assets'?[]:null;
              return Promise.resolve({data,error:null}).then(resolve);
            }
          }},
          functions:{invoke(){throw new Error('Backend requests forbidden in layout fixture')}},
          rpc(){throw new Error('Mutations forbidden in layout fixture')}
        };` }));
    } }],
  });
  const css = (await readFile(join(rootDir, 'src/styles.css'), 'utf8')).replace(/^@import[^;]+;\s*/, '');
  const html = (await readFile(join(rootDir, 'index.html'), 'utf8'))
    .replace('<script type="module" src="/src/main.tsx"></script>', `<style>${css}</style><script type="module" src="/fixture.js"></script>`);
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': request.url === '/fixture.js' ? 'text/javascript' : 'text/html' });
    response.end(request.url === '/fixture.js' ? bundled.outputFiles[0].text : html);
  });
  t.after(() => server.close());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = await mkdtemp(join(tmpdir(), 'beatvision-layout-fixture-'));
  const browser = spawn(chromium, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--no-first-run', '--disable-sync', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, 'about:blank']);
  t.after(async () => {
    if (browser.exitCode === null) {
      browser.kill('SIGTERM');
      await new Promise(resolve => browser.once('exit', resolve));
    }
    // Chrome subprocesses can release profile files after the parent exits.
    // Retry only transient filesystem cleanup races; preserve layout assertions.
    await rm(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 125 });
  });
  const browserUrl = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Local Chromium did not start within 10 seconds. ' + output.slice(-1_500))), 10_000);
    browser.once('error', error => { clearTimeout(timer); reject(error); });
    browser.once('exit', code => { clearTimeout(timer); reject(new Error('Local Chromium exited before readiness (' + code + '). ' + output.slice(-1_500))); });
    browser.stderr.on('data', chunk => {
      output = (output + chunk).slice(-16_384);
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const debugPort = new URL(browserUrl).port;
  const pages = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
  const ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  t.after(() => ws.close());
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const result = JSON.parse(event.data);
    const call = pending.get(result.id);
    if (!call) return;
    clearTimeout(call.timer); pending.delete(result.id);
    if (result.error) call.reject(new Error(JSON.stringify(result.error)));
    else call.resolve(result.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timed out: ' + method)); }, 10_000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await cdp('Network.enable');
  await cdp('Network.setBlockedURLs', { urls: ['https://*', 'wss://*'] });
  await cdp('Runtime.enable');
  const measurements = [];
  for (const width of [390, 980]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: true });
    await cdp('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/' });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await cdp('Runtime.evaluate', { expression: '!!document.querySelector(".production-detail")', returnByValue: true });
      if (result.result.value) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(ready, 'Actual workspace component must render before measuring.');
    const result = await cdp('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      const list=document.querySelector('.production-scene-list'), detail=document.querySelector('.production-detail');
      const buttons=[...list.querySelectorAll('button')], first=buttons[0].getBoundingClientRect();
      const second=buttons[1].getBoundingClientRect(), label=list.querySelector('.panel-label').getBoundingClientRect();
      const listRect=list.getBoundingClientRect(), detailRect=detail.getBoundingClientRect();
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
        listDisplay:getComputedStyle(list).display,listColumns:getComputedStyle(list).gridTemplateColumns,
        listWidth:listRect.width,listHeight:listRect.height,detailX:detailRect.x,detailY:detailRect.y,
        stacked:detailRect.y>=listRect.bottom,labelWidth:label.width,firstX:first.x,secondX:second.x,
        firstY:first.y,secondY:second.y,brandSize:getComputedStyle(document.querySelector('.studio-brand')).fontSize};
    })()` });
    measurements.push(result.result.value);
  }
  t.diagnostic(JSON.stringify(measurements));
  const [mobile, desktop] = measurements;
  assert.equal(mobile.width, 390);
  assert.equal(mobile.scrollWidth, 390);
  assert.equal(mobile.stacked, true);
  assert.equal(mobile.listDisplay, 'grid', 'Mobile scene navigation must activate its intended compact grid.');
  assert.equal(mobile.brandSize, '15px');
  assert.equal(mobile.firstY, mobile.secondY, 'Two scene buttons should fit side by side at 390px.');
  assert.ok(mobile.secondX > mobile.firstX);
  assert.ok(mobile.labelWidth > mobile.listWidth * 0.8, 'The scenes label spans the scene grid.');
  assert.equal(desktop.width, 980);
  assert.equal(desktop.scrollWidth, 980);
  assert.equal(desktop.stacked, false);
  assert.equal(desktop.listWidth, 280);
  assert.equal(desktop.listDisplay, 'flex');
});
