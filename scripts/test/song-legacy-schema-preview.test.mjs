import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const hook = await readFile(new URL('../../src/hooks/useSong.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../../src/pages/SongPage.tsx', import.meta.url), 'utf8');

test('legacy schema fallback is limited to missing new Song Intelligence columns', () => {
  assert.match(hook, /full\.error\?\.code === "42703"/);
  assert.match(hook, /visual_style_preferences\|audio_source_fingerprint/);
  assert.match(hook, /setSchemaReady\(!missingNewColumns\)/);
  assert.match(hook, /select\("id,project_id,title,artist,audio_path,audio_revision,lyrics,creative_direction,notes,analysis_status,analysis,analyzed_at,created_at,updated_at"\)/);
});
test('legacy mode never writes artist visual style columns or displays interpretation approvals', () => {
  assert.match(page, /if \(schemaReady\) payload\.visual_style_preferences/);
  assert.match(page, /disabled=\{!schemaReady\}/);
  assert.match(page, /\{schemaReady \? <SongInterpretationPanel/);
  assert.match(page, /World confirmation are locked until the Song Intelligence database migration/);
  assert.match(page, /\{schemaReady && \(saved \|\| song\?\.analysis_status/);
});
test('legacy mode discloses backend incompatibility without a fake success claim', () => {
  assert.match(page, /This preview can read and edit your existing song details/);
  assert.match(page, /database upgrade and are unavailable/);
  assert.doesNotMatch(page, /schemaReady \? <SongInterpretationPanel[\s\S]*? : <SongInterpretationPanel/);
});
