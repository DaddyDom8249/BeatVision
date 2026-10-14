import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGeneration } from './generation-runtime.mjs';

const characters = [
  { id: 'c1', name: 'Mara', status: 'approved', sheet: { appearance: 'silver braid', wardrobe: 'red coat' }, supersedes_character_id: null },
  { id: 'c2', name: 'Mara', status: 'approved', sheet: { appearance: 'silver braid, scar' }, supersedes_character_id: 'c1' },
  { id: 'c3', name: 'Theo', status: 'draft', sheet: {}, supersedes_character_id: null },
  { id: 'c4', name: 'Ann', status: 'approved', sheet: {}, supersedes_character_id: null },
];
const environments = [
  { id: 'e1', name: 'Neon Pier', status: 'approved', sheet: { lighting: 'magenta signage' }, supersedes_environment_id: null },
];
const scene = { scene_number: 2, title: 'Arrival', visual_direction: 'Mara and Theo walk; planning ahead', location: 'the neon pier at dusk' };

function fakeDb({ assetsError } = {}) {
  const calls = [];
  const builder = (table) => {
    const state = { table, filters: [] };
    const q = {
      select() { return q; }, order() { return q; }, limit() { return q; },
      eq(k, v) { state.filters.push(['eq', k, v]); return q; },
      in(k, v) { state.filters.push(['in', k, v]); return q; },
      then(resolve) {
        calls.push(state);
        if (table === 'characters') return resolve({ data: characters });
        if (table === 'environments') return resolve({ data: environments });
        if (assetsError) return resolve({ error: { message: 'boom' } });
        const ids = state.filters.find((f) => f[0] === 'in')[2];
        const rows = table === 'character_assets'
          ? (ids.includes('c1') ? [{ id: 'a1', label: 'mara.png', storage_path: 'u/mara.png', status: 'approved' }] : [])
          : [{ id: 'a2', label: 'pier.png', storage_path: 'u/pier.png', status: 'approved' }];
        assert.ok(state.filters.some((f) => f[1] === 'status' && f[2] === 'approved'), 'only approved assets are requested');
        return resolve({ data: rows });
      },
    };
    return q;
  };
  return {
    calls,
    from: builder,
    storage: { from: () => ({ createSignedUrl: async (path) => ({ data: { signedUrl: 'https://signed.test/' + path } }) }) },
  };
}

const job = (type = 'scene_image') => ({
  id: 'job-1', job_type: type, project_id: 'p1', idempotency_key: 'k',
  input_snapshot: { scene, vision_snapshot: { style_bible_id: 'sb1', song: { analysis: { duration_seconds: 30 } } } },
});

test('scene mention matching is whole-word and case/accent insensitive', async () => {
  const rt = await loadGeneration();
  try {
    assert.equal(rt.sceneMentions({ title: 'MÁRA runs' }, 'Mara'), true);
    assert.equal(rt.sceneMentions({ title: 'Annabel runs' }, 'Ann'), false);
    assert.equal(rt.sceneMentions({ title: 'planning' }, 'Ann'), false);
    assert.equal(rt.sceneMentions({ title: 'x' }, ''), false);
  } finally { await rt.cleanup(); }
});

test('only the latest approved revision of mentioned subjects is selected', async () => {
  const rt = await loadGeneration();
  try {
    const sel = rt.selectSceneReferences(scene, characters, environments);
    assert.deepEqual(sel.characters.map((c) => c.id), ['c2']);
    assert.deepEqual(sel.characters[0].lineage, ['c2', 'c1']);
    assert.deepEqual(sel.environments.map((e) => e.id), ['e1']);
  } finally { await rt.cleanup(); }
});

test('scene image payload carries approved reference images and directives', async () => {
  const rt = await loadGeneration();
  try {
    const db = fakeDb();
    const payload = await rt.bridgePayload(db, job());
    assert.equal(payload.references.characters.length, 1);
    assert.equal(payload.references.characters[0].name, 'Mara');
    assert.deepEqual(payload.references.characters[0].images, [{ asset_id: 'a1', label: 'mara.png', image_url: 'https://signed.test/u/mara.png', image_variant: 'original' }]);
    assert.equal(payload.references.environments[0].images[0].image_url, 'https://signed.test/u/pier.png');
    assert.match(payload.scene.consistency_directives.join('\n'), /Mara.*silver braid, scar/);
    assert.match(payload.scene.consistency_directives.join('\n'), /Neon Pier.*magenta signage/);
    assert.equal(payload.scene.location, scene.location, 'original scene direction is preserved');
    assert.equal(job().input_snapshot.scene.consistency_directives, undefined, 'frozen snapshot is not mutated');
    const charQuery = db.calls.find((c) => c.table === 'characters');
    assert.ok(charQuery.filters.some((f) => f[1] === 'style_bible_id' && f[2] === 'sb1'));
  } finally { await rt.cleanup(); }
});

test('reference lookup failure fails explicitly instead of silently dropping references', async () => {
  const rt = await loadGeneration();
  try {
    await assert.rejects(rt.bridgePayload(fakeDb({ assetsError: true }), job()), /REFERENCE_LOOKUP_FAILED/);
  } finally { await rt.cleanup(); }
});

test('scenes without matching subjects keep the original payload shape', async () => {
  const rt = await loadGeneration();
  try {
    const j = job();
    j.input_snapshot.scene = { scene_number: 1, title: 'Empty sky' };
    const payload = await rt.bridgePayload(fakeDb(), j);
    assert.deepEqual(payload.scene, { scene_number: 1, title: 'Empty sky' });
    assert.deepEqual(payload.references, { characters: [], environments: [] });
  } finally { await rt.cleanup(); }
});

import { readFileSync } from 'node:fs';
const src = (name) => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');

test('style editors explain when references are used, and drafts are excluded', () => {
  assert.match(src('src/components/style/AssetList.tsx'), /Not used for scene generation until approved/);
  assert.match(src('src/components/style/CharacterEditor.tsx'), /sent with every scene image generation/);
  assert.match(src('src/components/style/EnvironmentEditor.tsx'), /sent with every scene image generation/);
});
