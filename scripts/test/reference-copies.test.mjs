import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { loadGeneration } from './generation-runtime.mjs';

const src = (name) => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
async function loadResize() {
  const out = ts.transpileModule(src('src/lib/style/referenceResize.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const file = join(mkdtempSync(join(tmpdir(), 'refresize-')), 'm.mjs');
  writeFileSync(file, out);
  return import(pathToFileURL(file).href);
}

test('reference copy dimensions fit strictly under 512 and preserve aspect ratio', async () => {
  const { computeReferenceSize, referenceCopyPath } = await loadResize();
  for (const [w, h] of [[1024, 1024], [4000, 3000], [1080, 1920], [512, 512], [512, 100], [5000, 50], [513, 511]]) {
    const s = computeReferenceSize(w, h);
    assert.ok(s, `${w}x${h} resized`);
    assert.ok(s.width < 512 && s.height < 512, `${w}x${h} -> ${s.width}x${s.height}`);
    assert.equal(Math.max(s.width, s.height), 511);
    const scale = 511 / Math.max(w, h);
    assert.ok(Math.abs(s.width - w * scale) <= 0.5 && Math.abs(s.height - h * scale) <= 0.5, 'aspect ratio kept (within rounding)');
  }
  assert.equal(computeReferenceSize(511, 300), null, 'already-small images need no copy');
  assert.equal(computeReferenceSize(0, 10), null);
  assert.equal(computeReferenceSize(NaN, 10), null);
  assert.equal(referenceCopyPath('u/p/characters/c/x-a.jpg'), 'u/p/characters/c/x-a.jpg.ref511.png');
  assert.notEqual(referenceCopyPath('a.png'), 'a.png', 'copy never overwrites the original path');
});

function db(rows, { failCopy = false, throwCopy = false } = {}) {
  const signedPaths = [];
  const builder = (table) => { const q = { select() { return q; }, eq() { return q; }, in() { return q; }, order() { return q; }, limit() { return q; }, then: (r) => r({ data: table.endsWith('_assets') ? rows : [] }) }; return q; };
  return {
    signedPaths,
    from: builder,
    storage: { from: () => ({ createSignedUrl: async (p) => {
      signedPaths.push(p);
      if (p.includes('.ref511')) { if (throwCopy) throw new Error('x'); if (failCopy) return { error: { message: 'Object not found' } }; }
      return { data: { signedUrl: 'https://signed.test/' + p } };
    } }) },
  };
}

test('signReferenceCopy uses small copy when present and falls back gracefully', async () => {
  const rt = await loadGeneration();
  try {
    const copy = { storage_path: 'u/a.png.ref511.png', width: 511, height: 300 };
    assert.equal(await rt.signReferenceCopy(db([]), { storage_path: 'u/a.png', metadata: { reference_copy: copy } }), 'https://signed.test/u/a.png.ref511.png');
    assert.equal(await rt.signReferenceCopy(db([]), { storage_path: 'u/a.png', metadata: null }), null, 'legacy asset without copy');
    assert.equal(await rt.signReferenceCopy(db([]), { storage_path: 'u/a.png' }), null);
    assert.equal(await rt.signReferenceCopy(db([], { failCopy: true }), { storage_path: 'u/a.png', metadata: { reference_copy: copy } }), null, 'missing object');
    assert.equal(await rt.signReferenceCopy(db([], { throwCopy: true }), { storage_path: 'u/a.png', metadata: { reference_copy: copy } }), null, 'signing throws');
    assert.equal(await rt.signReferenceCopy(db([]), { storage_path: 'u/a.png', metadata: { reference_copy: { ...copy, width: 512 } } }), null, 'oversized copy metadata rejected');
    assert.equal(await rt.signReferenceCopy(db([]), { storage_path: 'u/a.png', metadata: { reference_copy: { ...copy, storage_path: 'u/a.png' } } }), null, 'copy cannot alias original');
  } finally { await rt.cleanup(); }
});

test('scene payload sends small copy when present and original otherwise, recording which', async () => {
  const rt = await loadGeneration();
  try {
    const characters = [{ id: 'c1', name: 'Mara', status: 'approved', sheet: {}, supersedes_character_id: null }];
    const rows = [
      { id: 'a1', label: 'new', storage_path: 'u/new.jpg', status: 'approved', metadata: { reference_copy: { storage_path: 'u/new.jpg.ref511.png', width: 511, height: 287 } } },
      { id: 'a2', label: 'legacy', storage_path: 'u/old.png', status: 'approved', metadata: {} },
    ];
    const d = db(rows, {});
    const base = d.from;
    d.from = (t) => t === 'characters' ? { select() { const q = { eq() { return q; }, then: (r) => r({ data: characters }) }; return q; } } : base(t);
    const job = { id: 'j', job_type: 'scene_image', project_id: 'p', idempotency_key: 'k', input_snapshot: { scene: { scene_number: 1, title: 'Mara waits' }, vision_snapshot: { style_bible_id: 'sb', song: { analysis: { duration_seconds: 10 } } } } };
    const payload = await rt.bridgePayload(d, job);
    const imgs = payload.references.characters[0].images;
    assert.deepEqual(imgs.map((i) => [i.asset_id, i.image_variant, i.image_url]), [
      ['a1', 'reference_copy', 'https://signed.test/u/new.jpg.ref511.png'],
      ['a2', 'original', 'https://signed.test/u/old.png'],
    ]);
    assert.ok(!d.signedPaths.includes('u/new.jpg'), 'original not signed when copy available');
  } finally { await rt.cleanup(); }
});

test('upload stores copy at a separate path and never replaces the original', () => {
  const hook = src('src/hooks/useStyleStudio.ts');
  assert.match(hook, /referenceCopyPath\(path\)/);
  assert.match(hook, /upload\(copyPath, copy\.blob, \{ upsert: false/);
  assert.match(hook, /upload\(path, file, \{\s*upsert: false/);
  assert.match(hook, /reference_copy: referenceCopy/);
  assert.doesNotMatch(hook, /upsert: true/);
});
