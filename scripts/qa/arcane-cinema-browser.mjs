/** Local-only browser verification. Every backend request is intercepted. No provider or production writes. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require((process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || 'node_modules') + '/playwright');
const { PNG } = require('pngjs');
const current = process.env.ARCANE_QA_URL || 'http://127.0.0.1:4173';
const baseline = process.env.ARCANE_BASELINE_URL || 'http://127.0.0.1:4174';
const mediaRoot = process.env.ARCANE_QA_MEDIA || resolve('..', 'qa-media');
const out = resolve('docs/arcane-cinema');
await mkdir(out, { recursive: true });
const image = await readFile(resolve(mediaRoot, 'Ghast_frame.jpg'));
const clip = await readFile(resolve(mediaRoot, 'Ghast_AI_Motion_LTX.mp4'));
const { createServer, preview } = await import('vite');
const devServer = await createServer({ server: { host: '127.0.0.1', port: 4173, strictPort: true } });
await devServer.listen();
const baselineServer = await preview({ preview: { host: '127.0.0.1', port: 4174, strictPort: true } });
const browser = await chromium.launch({ executablePath: process.env.ARCANE_CHROMIUM || resolve('..', 'arcane-browser-runtime/chromium'), args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], headless: true });
const results = { browser: browser.version(), fixture: 'Synthetic scene/approval state. Only media is the user supplied saved 1.9-second Ghast clip and its first frame.', widths: [], checks: [], creativeRequests: [] };
const duration = 249.126908314;
function sceneRows(status) { return Array.from({ length: 8 }, (_, i) => ({ id: 'scene-' + (i + 1), project_id: 'qa-project', visual_plan_id: 'qa-plan', scene_number: i + 1, status,
  title: ['The threshold', 'Echoes in the corridor', 'A moment of resolve', 'Through the silence', 'The weight of memory', 'Light at the doorway', 'The world opens', 'A new beginning'][i],
  start_time: i * duration / 8, end_time: (i + 1) * duration / 8, camera_direction: ['Medium shot · eye level', 'Wide establishing shot', 'Close-up · shallow focus'][i % 3],
  visual_direction: ['The central figure holds still in a dim industrial corridor.', 'The architecture echoes the song’s rising tension.', 'A quiet breath gives way to a deliberate step.'][i % 3],
  movement_direction: 'Slow tracking camera; restrained subject movement.', location: 'Industrial corridor', mood: 'Haunting, intimate, resolute', lyric_moment: 'Instrumental opening', transition_style: 'Cut on the musical phrase', continuity_notes: 'Preserve the locked character and wardrobe.' })); }
async function setup(url, viewport, theme = 'arcane', mode = 'approved', stage = 'visual-plan') {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const user = { id: 'qa-owner', email: 'fixture@beatvision.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-10-15T00:00:00Z' };
  const session = { access_token: 'qa-fixture-only.not-a-real-session.signature', refresh_token: 'qa-fixture-only', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user };
  await context.addInitScript(({ session, theme }) => {
    if (!localStorage.getItem('beatvision.appearance.v1')) localStorage.setItem('beatvision.appearance.v1', JSON.stringify({ theme, motion: 'system' }));
    localStorage.setItem('sb-mdofsinyofqbeapzfygu-auth-token', JSON.stringify(session));
  }, { session, theme });
  let scenes = sceneRows(mode === 'draft' ? 'draft' : 'approved');
  const plan = { id: 'qa-plan', project_id: 'qa-project', world_report_id: 'qa-world', style_bible_id: 'qa-style', song_id: 'qa-song', vision_lock_id: 'qa-lock', status: mode === 'draft' ? 'draft' : 'approved', revision_number: 1,
    title: 'UI TEST FIXTURE / Ghast media', duration_seconds: duration, global_direction: {}, locked_at: '2026-10-15T00:00:00Z', created_at: '2026-10-15T00:00:00Z' };
  const snapshot = { characters: [{ name: 'Central figure · locked character context' }], style_bible: { color_lighting: 'Violet shadows, cold overhead light.' } };
  const requests = [], errors = [];
  await context.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url());
    const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      if (u.pathname === '/__qa/ghast.jpg') return mode === 'broken'
        ? route.fulfill({ status: 404, contentType: 'text/plain', body: 'Fixture image unavailable' })
        : route.fulfill({ status: 200, contentType: 'image/jpeg', body: image });
      if (u.pathname === '/__qa/ghast.mp4') return route.fulfill({ status: 200, contentType: 'video/mp4', headers: { 'accept-ranges': 'bytes' }, body: clip });
      return route.continue();
    }
    if (u.pathname.startsWith('/auth/v1/')) {
      if (req.method() === 'PUT') Object.assign(user.user_metadata, req.postDataJSON()?.data ?? {});
      return json(u.pathname.endsWith('/user') ? user : { ...session, user });
    }
    if (u.pathname.startsWith('/functions/v1/')) {
      const body = req.postDataJSON(); requests.push({ method: req.method(), path: u.pathname, action: body?.action });
      assert.ok(['image_url', 'motion_url'].includes(body?.action), 'No generation action is permitted by this fixture');
      return json(body.action === 'image_url' ? { image_url: url + '/__qa/ghast.jpg' } : { video_url: url + '/__qa/ghast.mp4' });
    }
    if (u.pathname.startsWith('/rest/v1/')) {
      const table = u.pathname.split('/').at(-1);
      if (req.method() !== 'GET' && req.method() !== 'HEAD') {
        requests.push({ method: req.method(), table, body: req.postDataJSON() });
        assert.equal(table, 'visual_plan_scenes', 'Only explicit draft-save fixture writes are permitted');
        assert.equal(mode, 'draft');
        const id = u.searchParams.get('id')?.replace('eq.', '');
        scenes = scenes.map(s => s.id === id ? { ...s, ...req.postDataJSON() } : s);
      }
      let rows = table === 'projects' ? [{ id: 'qa-project', title: plan.title, owner_id: user.id, world_report_id: 'qa-world' }]
        : table === 'world_reports' ? [{ id: 'qa-world', status: 'completed', confirmed_at: '2026-10-15T00:00:00Z', color_lighting: snapshot.style_bible.color_lighting }]
        : table === 'style_bibles' ? [{ id: 'qa-style', world_report_id: 'qa-world', status: 'approved', approved_at: '2026-10-15T00:00:00Z' }]
        : table === 'songs' ? [{ id: 'qa-song', project_id: 'qa-project', title: 'QA song', analysis_status: 'completed', analysis: { duration_seconds: duration, sections: [{ start: 0, end: duration }] } }]
        : table === 'visual_plans' ? [plan]
        : table === 'vision_locks' ? [{ id: 'qa-lock', project_id: 'qa-project', snapshot, status: 'locked' }]
        : table === 'visual_plan_scenes' ? scenes
        : table === 'scene_image_assets' ? mode === 'empty' || mode === 'draft' ? [] : [{ id: 'qa-image', project_id: 'qa-project', visual_plan_id: 'qa-plan', scene_id: 'scene-1', image_url: url + '/__qa/ghast.jpg', storage_path: null, status: 'approved', approved: true }]
        : table === 'motion_clip_assets' ? mode === 'empty' ? [] : [{ id: 'qa-motion', scene_id: 'scene-1', project_id: 'qa-project', visual_plan_id: 'qa-plan', video_url: url + '/__qa/ghast.mp4', status: 'approved', approved: true, provider: 'huggingface-zerogpu', model: 'ltx-0.9.8' }]
        : [];
      const idFilter = u.searchParams.get('id');
      if (idFilter) rows = rows.filter(r => r.id === idFilter.replace('eq.', ''));
      const sceneFilter = u.searchParams.get('scene_id');
      if (sceneFilter) rows = rows.filter(r => r.scene_id === sceneFilter.replace('eq.', ''));
      if (mode === 'error' && table === 'scene_image_assets') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Fixture preview unavailable' }) });
      return json(req.headers().accept?.includes('vnd.pgrst.object+json') ? rows[0] ?? null : rows);
    }
    // Block telemetry and every unrecognized external request, including providers.
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url + '/projects/qa-project/' + stage + '?plan=qa-plan');
  await page.locator(stage === 'visual-plan' ? '.visual-plan-scene' : '.production-detail').first().waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  return { context, page, requests, errors, scenes: () => scenes };
}
async function appearance(page, theme) {
  await page.getByRole('button', { name: 'Appearance settings', exact: true }).click();
  await page.locator('input[value="' + theme + '"]').check();
  await page.getByRole('button', { name: 'Close appearance settings', exact: true }).click();
  await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
}
async function widths(page) {
  return page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('main *')].filter(n => { const r = n.getBoundingClientRect(), s = getComputedStyle(n); return r.width && s.visibility !== 'hidden' && s.display !== 'none' && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 10).map(n => n.className || n.tagName) }));
}
try {
  // Before/after Classic equality, with identical safe fixtures and viewport.
  for (const [label, url] of [['before', baseline], ['after', current]]) {
    // Preserve the independently captured pre-change artifact after rebuilding dist.
    if (label === 'before' && process.env.ARCANE_REUSE_BASELINE === '1') {
      await readFile(out + '/classic-before-desktop.png');
      results.checks.push('Classic before: retained pre-change 9a108832 screenshot');
      continue;
    }
    const f = await setup(url, { width: 1440, height: 1000 }, 'classic', 'draft');
    await f.page.screenshot({ path: out + '/classic-' + label + '-desktop.png', fullPage: true });
    assert.equal(await f.page.locator('.arcane-storyboard').count(), 0);
    assert.equal(f.requests.some(r => r.action), false);
    results.checks.push('Classic ' + label + ': no storyboard/media reads, editors remain present');
    assert.deepEqual(f.errors, []); await f.context.close();
  }
  const before = PNG.sync.read(await readFile(out + '/classic-before-desktop.png')), after = PNG.sync.read(await readFile(out + '/classic-after-desktop.png'));
  assert.equal(before.width, after.width); assert.equal(before.height, after.height);
  let changed = 0; for (let i = 0; i < before.data.length; i += 4) if (before.data[i] !== after.data[i] || before.data[i+1] !== after.data[i+1] || before.data[i+2] !== after.data[i+2]) changed++;
  results.classicPixelDifference = changed; assert.equal(changed, 0);
  for (const width of [1440, 768, 390, 360, 320]) {
    const f = await setup(current, { width, height: width > 800 ? 1000 : 844 });
    await f.page.locator('.arcane-storyboard-scene').first().waitFor();
    await f.page.locator('.arcane-storyboard-thumbnail img').first().evaluate(n => n.decode());
    assert.equal(await f.page.locator('.arcane-storyboard-scene').count(), 8);
    const geometry = await widths(f.page); results.widths.push(geometry); assert.ok(geometry.document <= width, JSON.stringify(geometry)); assert.deepEqual(geometry.offenders, []);
    assert.equal(await f.page.evaluate(() => document.documentElement.dataset.motion), 'reduce');
    if (width === 1440 || width === 390) await f.page.screenshot({ path: out + '/implemented-' + (width === 1440 ? 'desktop' : 'mobile') + '.png', fullPage: true });
    const first = f.page.locator('.arcane-storyboard-scene').first(); await first.focus(); await first.press('End');
    assert.equal(await f.page.locator('.arcane-storyboard-scene').last().getAttribute('aria-pressed'), 'true');
    await f.page.getByRole('button', { name: 'Previous scene', exact: true }).click();
    assert.equal(await f.page.locator('.arcane-storyboard-scene').nth(6).getAttribute('aria-pressed'), 'true');
    await first.click();
    await f.page.locator('.arcane-director-panel summary').click();
    await f.page.getByRole('button', { name: 'Review scene direction', exact: true }).click();
    assert.equal(await f.page.evaluate(() => document.activeElement?.id), 'scene-director-scene-1');
    const locked = f.page.locator('#scene-director-scene-1');
    assert.equal(await locked.locator('input:not(:disabled),textarea:not(:disabled)').count(), 0);
    await appearance(f.page, 'classic');
    assert.equal(await f.page.locator('.arcane-storyboard').count(), 0);
    await appearance(f.page, 'arcane'); await f.page.reload();
    await f.page.locator('.arcane-storyboard-scene').first().waitFor();
    assert.equal(await f.page.evaluate(() => document.documentElement.dataset.theme), 'arcane');
    assert.deepEqual(f.errors, []); assert.equal(f.requests.some(r => r.method === 'PATCH'), false);
    results.checks.push(width + 'px: sequence, keyboard End, previous, locked review, theme persistence, OS motion');
    await f.context.close();
  }
  const video = await setup(current, { width: 1440, height: 1000 });
  await video.page.getByRole('button', { name: 'Motion', exact: true }).click();
  await video.page.locator('.arcane-preview-screen video').waitFor();
  await video.page.waitForFunction(() => document.querySelector('.arcane-preview-screen video')?.readyState >= 2);
  const decoded = await video.page.locator('.arcane-preview-screen video').evaluate(async v => { await v.play(); return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, controls: v.controls, paused: v.paused, error: v.error?.code ?? null }; });
  assert.equal(decoded.duration, 1.9); assert.equal(decoded.controls, true); assert.equal(decoded.error, null);
  await video.page.waitForFunction(() => document.querySelector('.arcane-preview-screen video')?.currentTime > 0.05);
  await video.page.locator('.arcane-preview-screen video').evaluate(v => v.pause());
  await video.page.screenshot({ path: out + '/real-media-playback-fixture.png', fullPage: true });
  await video.page.locator('.arcane-storyboard-scene').nth(1).click();
  assert.equal(await video.page.locator('.arcane-preview-screen video').count(), 0);
  results.decodedMedia = decoded; results.checks.push('Real saved MP4 decoded/played/paused; scene switch removes stale video');
  assert.deepEqual(video.errors, []); await video.context.close();
  const draft = await setup(current, { width: 390, height: 844 }, 'arcane', 'draft');
  await draft.page.locator('.arcane-director-panel summary').click();
  await draft.page.getByRole('button', { name: 'Edit scene direction', exact: true }).click();
  const title = draft.page.locator('#scene-director-scene-1').getByLabel('Scene title', { exact: true });
  await title.fill('My unsaved direction');
  await appearance(draft.page, 'classic'); assert.equal(await title.inputValue(), 'My unsaved direction');
  await appearance(draft.page, 'arcane'); assert.equal(await title.inputValue(), 'My unsaved direction');
  await draft.page.locator('#scene-director-scene-1').getByRole('button', { name: 'Save Scene Direction', exact: true }).click();
  await draft.page.waitForFunction(() => document.querySelector('.arcane-storyboard-scene strong')?.textContent === 'My unsaved direction');
  assert.equal(draft.scenes()[0].title, 'My unsaved direction');
  assert.equal(draft.requests.filter(r => r.method === 'PATCH').length, 1);
  results.creativeRequests.push(...draft.requests.filter(r => r.method === 'PATCH')); results.checks.push('Unsaved draft survives both themes; existing save writes exactly one intercepted draft update');
  assert.deepEqual(draft.errors, []); await draft.context.close();
  for (const width of [1440, 390]) {
    const f = await setup(current, { width, height: 900 }, 'arcane', 'approved', 'production');
    await f.page.locator('.arcane-storyboard-scene:not(:disabled)').first().waitFor();
    await f.page.locator('.arcane-director-panel summary').click();
    await f.page.getByRole('button', { name: 'Review scene direction', exact: true }).click();
    assert.equal(await f.page.evaluate(() => document.activeElement?.id), 'scene-director-scene-1');
    await f.page.locator('.arcane-storyboard-scene').nth(1).click();
    await f.page.locator('#scene-director-scene-2').waitFor();
    const geometry = await widths(f.page); assert.ok(geometry.document <= width, JSON.stringify(geometry)); assert.deepEqual(geometry.offenders, []);
    assert.equal(f.requests.some(r => r.method === 'PATCH'), false);
    assert.deepEqual(f.errors, []);
    results.checks.push(width + 'px production: shared storyboard selection, Director focus, existing controls, no creative writes');
    await f.page.evaluate(() => window.scrollTo(0, 0));
    await f.page.screenshot({ path: out + '/production-' + (width === 1440 ? 'desktop' : 'mobile') + '.png', fullPage: true });
    await f.context.close();
  }
  for (const mode of ['empty', 'broken', 'error']) {
    const f = await setup(current, { width: 390, height: 844 }, 'arcane', mode);
    await f.page.locator('.arcane-storyboard-scene').first().waitFor();
    if (mode === 'broken') await f.page.waitForFunction(() => document.querySelector('.arcane-storyboard-scene')?.textContent.includes('Preview unavailable'));
    if (mode === 'error') await f.page.getByRole('alert').first().waitFor();
    assert.equal(await f.page.locator('.arcane-preview-screen img').count(), 0);
    assert.equal(await f.page.locator('video').count(), 0);
    await f.page.screenshot({ path: out + '/state-' + mode + '-mobile.png', fullPage: true });
    assert.deepEqual(f.errors, []); results.checks.push(mode + ': honest unavailable state, no fabricated media'); await f.context.close();
  }
  results.status = 'PASS';
} catch (e) { results.status = 'FAIL'; results.error = e.stack; throw e; }
finally { await writeFile(out + '/browser-results.json', JSON.stringify(results, null, 2)); await browser.close(); await devServer.close(); await new Promise(resolve => baselineServer.httpServer.close(resolve)); console.log(JSON.stringify(results, null, 2)); }
