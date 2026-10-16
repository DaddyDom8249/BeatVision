import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const bootstrap = read('public/appearance-init.js');
const code = ts.transpileModule(read('src/theme/appearance.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
runInNewContext(code, { module: mod, exports: mod.exports, queueMicrotask });
const { AppearanceStore } = mod.exports;
const flush = () => new Promise(resolve => setImmediate(resolve));
const user = (id = 'creator', appearance) => ({ id, user_metadata: { untouched: 'retained', ...(appearance ? { beatvision_appearance: appearance } : {}) } });

function fixture(t, { local, account = null, reduced = false, initial, update } = {}) {
  const dom = new JSDOM('<html><body></body></html>', { url: 'https://fixture.test', runScripts: 'outside-only' });
  const { window } = dom;
  const changes = new Set();
  const media = { matches: reduced, addEventListener: (_, fn) => changes.add(fn), removeEventListener: (_, fn) => changes.delete(fn) };
  window.matchMedia = () => media;
  if (local) window.localStorage.setItem('beatvision.appearance.v1', JSON.stringify(local));
  window.eval(bootstrap);
  const callbacks = new Set(), writes = [];
  let savedUser = account;
  const auth = {
    getUser: initial ?? (async () => ({ data: { user: savedUser }, error: null })),
    onAuthStateChange(fn) { callbacks.add(fn); return { data: { subscription: { unsubscribe: () => callbacks.delete(fn) } } }; },
    async updateUser(payload) {
      writes.push(payload);
      if (update) return update(payload);
      savedUser = { ...savedUser, user_metadata: { ...savedUser.user_metadata, ...payload.data } };
      return { data: { user: savedUser }, error: null };
    },
  };
  const store = new AppearanceStore(auth, window);
  store.start();
  t.after(() => { store.stop(); window.close(); });
  return { store, window, auth, writes, snapshot: store.getSnapshot,
    signedIn: () => savedUser,
    event(event, next) { savedUser = next; for (const callback of callbacks) callback(event, next ? { user: next } : null); },
    system(value) { media.matches = value; for (const change of changes) change({ matches: value }); },
  };
}

test('new visitors get Classic and system motion before React mounts', t => {
  const f = fixture(t);
  assert.equal(f.window.document.documentElement.dataset.theme, 'classic');
  assert.equal(f.snapshot().preference.theme, 'classic');
  assert.equal(f.snapshot().preference.motion, 'system');
});

test('bootstrap validates preferences and rejects corrupted or injected theme values', t => {
  const f = fixture(t, { local: { theme: 'arcane" style="display:none', motion: 'unknown' } });
  assert.equal(f.snapshot().preference.theme, 'classic');
  f.window.localStorage.setItem('beatvision.appearance.v1', '{bad json');
  assert.equal(f.window.BeatVisionAppearance.read().theme, 'classic');
});

test('initial theme branch boolean motion preferences migrate without losing the selected theme', async t => {
  const f = fixture(t, { local: { theme: 'arcane', reducedMotion: true } });
  await flush();
  assert.equal(f.snapshot().preference.theme, 'arcane');
  assert.equal(f.snapshot().preference.motion, 'reduce');
  assert.equal(f.window.document.documentElement.dataset.motion, 'reduce');
});

test('legacy account false means system motion and takes precedence over local reduction', async t => {
  const f = fixture(t, { local: { theme: 'arcane', motion: 'reduce' }, account: user('creator', { theme: 'classic', reducedMotion: false }) });
  await flush();
  assert.equal(f.snapshot().preference.theme, 'classic');
  assert.equal(f.snapshot().preference.motion, 'system');
});

test('explicit motion fields take precedence over legacy boolean preferences', async t => {
  const f = fixture(t, { local: { theme: 'arcane', motion: 'full', reducedMotion: true }, reduced: true });
  await flush(); assert.equal(f.snapshot().reducedMotion, false);
});

test('explicit authenticated preference wins over local, then local wins over Classic', async t => {
  const f = fixture(t, { local: { theme: 'arcane', motion: 'reduce' }, account: user('creator', { theme: 'classic', motion: 'full' }), reduced: true });
  await flush();
  assert.equal(f.snapshot().preference.theme, 'classic');
  assert.equal(f.snapshot().reducedMotion, false);
  assert.equal(f.writes.length, 0, 'Reading a preference must not mutate the account');
  f.event('SIGNED_OUT', null);
  await flush();
  assert.equal(f.snapshot().preference.theme, 'arcane');
});

test('selection is immediate, persists locally, reverts in one action and survives a reload', async t => {
  const f = fixture(t);
  await flush();
  f.store.setTheme('arcane');
  assert.equal(f.window.document.documentElement.dataset.theme, 'arcane');
  assert.equal(JSON.parse(f.window.localStorage.getItem('beatvision.appearance.v1')).theme, 'arcane');
  f.window.eval(bootstrap);
  assert.equal(f.window.document.documentElement.dataset.theme, 'arcane');
  f.store.setTheme('classic');
  assert.equal(f.window.document.documentElement.dataset.theme, 'classic');
  assert.equal(f.writes.length, 0);
});

test('account save only updates the display namespace and survives signing in again', async t => {
  const f = fixture(t, { account: user() });
  await flush();
  f.store.setTheme('arcane');
  await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(f.writes)), [{ data: { beatvision_appearance: { theme: 'arcane', motion: 'system' } } }]);
  assert.equal(f.signedIn().user_metadata.untouched, 'retained');
  assert.equal(f.snapshot().synced, true);
  const saved = f.signedIn();
  f.event('SIGNED_OUT', null); await flush();
  f.window.localStorage.removeItem('beatvision.appearance.v1');
  f.event('SIGNED_IN', saved); await flush();
  assert.equal(f.snapshot().preference.theme, 'arcane');
});

test('failed account writes keep the selected theme, expose the failure and support retry', async t => {
  let fail = true;
  const f = fixture(t, { account: user(), update: async payload => fail ? { data: { user: null }, error: new Error('offline') }
    : { data: { user: user('creator', payload.data.beatvision_appearance) }, error: null } });
  await flush(); f.store.setTheme('arcane'); await flush();
  assert.equal(f.snapshot().preference.theme, 'arcane');
  assert.equal(f.snapshot().synced, false);
  assert.match(f.snapshot().syncError, /could not be saved/);
  fail = false; f.store.retrySync(); await flush();
  assert.equal(f.snapshot().synced, true);
});

test('a failed account save survives same-user auth refresh without losing Retry', async t => {
  let fail = true;
  const stored = user('creator', { theme: 'classic', motion: 'system' });
  const f = fixture(t, { account: stored, update: async payload => fail
    ? { data: { user: null }, error: new Error('offline') }
    : { data: { user: user('creator', payload.data.beatvision_appearance) }, error: null } });
  await flush();
  f.store.setTheme('arcane');
  await flush();
  assert.equal(f.snapshot().preference.theme, 'arcane');
  assert.match(f.snapshot().syncError, /could not be saved/);
  f.event('TOKEN_REFRESHED', stored);
  await flush();
  assert.equal(f.snapshot().preference.theme, 'arcane');
  assert.equal(f.snapshot().synced, false);
  assert.match(f.snapshot().syncError, /could not be saved/);
  fail = false;
  f.store.retrySync();
  await flush();
  assert.equal(f.snapshot().synced, true);
  assert.equal(f.snapshot().preference.theme, 'arcane');
});

test('getUser error preserves local appearance and reports account sync error', async t => {
  const f = fixture(t, { local: { theme: 'arcane', motion: 'reduce' },
    initial: async () => ({ data: { user: null }, error: new Error('offline') }) });
  await flush();
  assert.equal(f.snapshot().preference.theme, 'arcane');
  assert.equal(f.snapshot().preference.motion, 'reduce');
  assert.equal(f.snapshot().account, false);
  assert.match(f.snapshot().syncError, /unavailable/);
});

test('a preference write without matching returned account metadata is not called synced', async t => {
  const f = fixture(t, { account: user(), update: async () => ({ data: { user: user() }, error: null }) });
  await flush(); f.store.setTheme('arcane'); await flush();
  assert.equal(f.snapshot().synced, false);
  assert.ok(f.snapshot().syncError);
});

test('OS reduced motion is live, but an explicit full-motion choice overrides it', async t => {
  const f = fixture(t, { reduced: true });
  await flush(); assert.equal(f.snapshot().reducedMotion, true);
  f.store.setMotion('full'); assert.equal(f.snapshot().reducedMotion, false);
  f.system(false); f.system(true); assert.equal(f.snapshot().reducedMotion, false);
  f.store.setMotion('system'); assert.equal(f.snapshot().reducedMotion, true);
  f.system(false); assert.equal(f.snapshot().reducedMotion, false);
});

test('a late initial account read cannot overwrite a newer explicit choice', async t => {
  let finish;
  const f = fixture(t, { account: user(), initial: () => new Promise(resolve => { finish = resolve; }) });
  f.store.setTheme('arcane');
  finish({ data: { user: user('creator', { theme: 'classic', motion: 'system' }) }, error: null });
  await flush(); assert.equal(f.snapshot().preference.theme, 'arcane');
  assert.equal(f.snapshot().synced, true);
});

test('sign-out invalidates a stale initial authenticated read', async t => {
  let finish;
  const f = fixture(t, { initial: () => new Promise(resolve => { finish = resolve; }) });
  f.event('SIGNED_OUT', null); await flush();
  finish({ data: { user: user('old', { theme: 'arcane', motion: 'full' }) }, error: null });
  await flush(); assert.equal(f.snapshot().account, false);
  assert.equal(f.snapshot().preference.theme, 'classic');
});

test('rapid selections serialize account writes and persist the latest choice', async t => {
  const releases = [];
  const f = fixture(t, { account: user(), update: payload => new Promise(resolve => releases.push(() => resolve({ data: { user: user('creator', payload.data.beatvision_appearance) }, error: null }))) });
  await flush();
  f.store.setTheme('arcane'); f.store.setTheme('classic'); f.store.setMotion('reduce');
  assert.equal(f.writes.length, 1);
  releases.shift()(); await flush(); assert.equal(f.writes.length, 2);
  releases.shift()(); await flush();
  assert.equal(f.snapshot().preference.theme, 'classic');
  assert.equal(f.snapshot().preference.motion, 'reduce');
  assert.equal(f.snapshot().synced, true);
});

test('account switches cancel queued writes and ignore the previous account response', async t => {
  let finish;
  const f = fixture(t, { account: user('first'), update: payload => new Promise(resolve => { finish = () => resolve({ data: { user: user('first', payload.data.beatvision_appearance) }, error: null }); }) });
  await flush(); f.store.setTheme('arcane'); f.store.setMotion('reduce');
  f.event('SIGNED_IN', user('second', { theme: 'classic', motion: 'full' })); await flush();
  finish(); await flush();
  assert.equal(f.writes.length, 1);
  assert.equal(f.snapshot().preference.theme, 'classic');
  assert.equal(f.snapshot().preference.motion, 'full');
});

test('blocked storage does not crash theme switching or make false persistence claims', async t => {
  const f = fixture(t); await flush();
  Object.defineProperty(f.window, 'localStorage', { get() { throw new Error('denied'); } });
  f.store.setTheme('arcane');
  assert.equal(f.snapshot().preference.theme, 'arcane');
  assert.match(f.snapshot().storageError, /unavailable/);
});

test('interrupted writes cannot leave a restarted provider permanently saving', async t => {
  let finish;
  const f = fixture(t, { account: user(), update: payload => new Promise(resolve => { finish = () => resolve({ data: { user: user('creator', payload.data.beatvision_appearance) }, error: null }); }) });
  await flush(); f.store.setTheme('arcane');
  assert.equal(f.snapshot().saving, true);
  f.store.stop(); f.store.start(); await flush();
  finish(); await flush();
  assert.equal(f.snapshot().saving, false);
});

test('Classic stylesheet is byte-for-byte the verified main baseline', () => {
  assert.equal(createHash('sha256').update(read('src/styles.css')).digest('hex'), 'cd0bd4cf0f25fbe5f29f6e8bc1aab59d6701486902d40845911da13f07835b02');
});
