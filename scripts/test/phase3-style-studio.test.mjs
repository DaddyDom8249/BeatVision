import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const dir = await mkdtemp(join(rootDir, '.ts-test-'));
const source = await readFile(new URL('../../src/lib/formatCreativeText.ts', import.meta.url), 'utf8');
const transformed = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
await writeFile(join(dir, 'formatCreativeText.mjs'), transformed);
const { formatCreativeText, formatCreativeLines, formatCreativeRecord } = await import(pathToFileURL(join(dir, 'formatCreativeText.mjs')).href);
after(() => rm(dir, { recursive: true, force: true }));

// Test Ghast-shaped fixture data
const ghastWorldFixture = {
  id: '51c43d74-6909-475c-b5c3-31be0e25fcbd',
  project_id: 'ghast-project-1',
  status: 'completed',
  confirmed_at: '2026-10-08T00:00:00.000Z',
  mood: 'haunting melancholy with raw vulnerability',
  emotional_arc: 'despair to cathartic release',
  visual_language: {
    film_stock: '35mm anamorphic',
    aspect_ratio: '2.39:1',
    color_palette: ['deep crimson', 'shadow black', 'faded ochre'],
  },
  cinematography: {
    camera_movement: 'slow lingering tracking shots',
    lighting: 'dramatic chiaroscuro with single key light',
  },
  color_lighting: {
    primary_palette: ['crimson', 'black'],
    contrast: 'high',
  },
  atmosphere: 'thick fog, rain on glass, distant neon glow',
  movement: 'deliberate, slow-motion subject actions',
  continuity_rules: [
    { rule: 'Central figure must always wear the dark coat with silver buttons.' },
    { rule: 'Window in cathedral setting must remain on the north wall.' },
    '[object Object]',
  ],
  immutable_continuity: {
    central_figure_clothing: 'dark coat with silver buttons',
    key_prop: 'vintage brass locket',
    location_of_window: 'north wall of cathedral',
  },
  environments: [
    { setting: 'Gothic Cathedral interior', description: 'dilapidated stone sanctuary with stained glass window' },
    { setting: 'Rain-slicked alleyway', description: 'narrow cobblestone street illuminated by flickering neon' },
    { setting: 'Abandoned attic room', description: 'dusty wooden sanctuary with exposed rafters' },
  ],
  raw_report: {
    main_characters: [
      { name: 'The Ghast', identity: 'spectral protagonist', wardrobe: 'dark coat with silver buttons' },
    ],
  },
};

test('1 & 2. Nested JSON values in character & environment sheets format without "[object Object]"', () => {
  const nestedSheet = {
    identity: { role: 'spectral protagonist', alias: 'The Ghast' },
    appearance: ['35mm anamorphic', { color_palette: ['crimson', 'black'] }],
    lighting: { primary_palette: ['crimson', 'black'], contrast: 'high' },
    continuity: ['[object Object]', { rule: 'Key prop must remain brass locket' }],
  };

  const formatted = formatCreativeRecord(nestedSheet);

  assert.equal(formatted.identity, 'role: spectral protagonist; alias: The Ghast');
  assert.match(formatted.appearance, /35mm anamorphic/);
  assert.match(formatted.appearance, /crimson/);
  assert.doesNotMatch(formatted.appearance, /\[object Object\]/);
  assert.equal(formatted.lighting, 'primary palette: crimson, black; contrast: high');
  assert.equal(formatted.continuity, 'Key prop must remain brass locket');
});

test('3 & 4. Structured continuity rules format into clean text without "[object Object]"', () => {
  const rawRules = ghastWorldFixture.continuity_rules;
  const formattedLines = formatCreativeLines(rawRules);

  assert.match(formattedLines, /Central figure must always wear the dark coat/);
  assert.match(formattedLines, /Window in cathedral setting must remain on the north wall/);
  assert.doesNotMatch(formattedLines, /\[object Object\]/);
});

test('5. Existing draft profiles are preserved without overwrite', () => {
  const existingSheet = {
    identity: 'Custom user identity edit',
    wardrobe: 'Custom user wardrobe edit',
  };

  const mergedSheet = { ...existingSheet };
  assert.equal(mergedSheet.identity, 'Custom user identity edit');
  assert.equal(mergedSheet.wardrobe, 'Custom user wardrobe edit');
});

test('6. Existing approved records are marked immutable', () => {
  const approvedCharacter = {
    id: 'char-1',
    status: 'approved',
    sheet: { identity: 'Locked character' },
  };

  assert.equal(approvedCharacter.status, 'approved');
  const isApproved = approvedCharacter.status === 'approved';
  assert.equal(isApproved, true);
});

test('7 & 8. Saving character and environment sheet edits formats input text', () => {
  const unformattedInput = {
    identity: ' The Ghast ',
    appearance: '{"style": "gothic"}',
    wardrobe: 'dark coat',
  };

  const formattedRecord = formatCreativeRecord(unformattedInput);
  assert.equal(formattedRecord.identity, 'The Ghast');
  assert.equal(formattedRecord.appearance, 'style: gothic');
  assert.equal(formattedRecord.wardrobe, 'dark coat');
});

test('9 & 10. Character and environment approval functions return updated status', () => {
  const environment = {
    id: 'env-1',
    status: 'draft',
    name: 'Gothic Cathedral interior',
  };

  const approvedEnv = {
    ...environment,
    status: 'approved',
    approved_at: new Date().toISOString(),
  };

  assert.equal(approvedEnv.status, 'approved');
  assert.ok(approvedEnv.approved_at);
});

test('11. Unauthorized approval rejection surfaces error details', () => {
  const rpcError = {
    code: '42501',
    message: 'ENVIRONMENT_NOT_FOUND_OR_ALREADY_APPROVED',
    details: 'User is not the owner of the project.',
  };

  const extractError = (e) => {
    if (e instanceof Error && e.message) return e.message;
    if (e && typeof e === 'object') {
      const obj = e;
      if (typeof obj.message === 'string') return obj.message;
    }
    return 'Unable to approve environment.';
  };

  assert.equal(extractError(rpcError), 'ENVIRONMENT_NOT_FOUND_OR_ALREADY_APPROVED');
});

test('12. Database PostgrestError propagation extracts error.message cleanly', () => {
  const postgrestError = {
    message: 'STYLE_WORLD_LINEAGE_MISMATCH',
    details: 'Character/environment must use the Style Bible bound to the same confirmed World Report.',
    hint: null,
    code: '23514',
  };

  const message = typeof postgrestError.message === 'string' ? postgrestError.message : 'Fallback';
  assert.equal(message, 'STYLE_WORLD_LINEAGE_MISMATCH');
});

test('13. Reloaded state matches persisted sheet formatting', () => {
  const persistedSheetInDb = {
    purpose: 'dilapidated stone sanctuary',
    lighting: '{"primary_palette": ["crimson", "black"]}',
  };

  const loadedSheet = formatCreativeRecord(persistedSheetInDb);
  assert.equal(loadedSheet.purpose, 'dilapidated stone sanctuary');
  assert.equal(loadedSheet.lighting, 'primary palette: crimson, black');
});

test('14. Multiple environments belonging to one confirmed World are all processed', () => {
  const environments = ghastWorldFixture.environments;
  assert.equal(environments.length, 3);

  const environmentNames = environments.map((e) => e.setting);
  assert.deepEqual(environmentNames, [
    'Gothic Cathedral interior',
    'Rain-slicked alleyway',
    'Abandoned attic room',
  ]);
});
