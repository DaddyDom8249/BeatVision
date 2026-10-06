import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20261006070000_song_analysis_audio_revision.sql",
  "utf8",
);
const songPage = fs.readFileSync("src/pages/SongPage.tsx", "utf8");
const songHook = fs.readFileSync("src/hooks/useSong.ts", "utf8");
const songType = fs.readFileSync("src/types/song.ts", "utf8");
const worldPage = fs.readFileSync("src/pages/WorldPage.tsx", "utf8");
const analyzer = fs.readFileSync(
  "supabase/functions/beatvision-analyze-song/index.ts",
  "utf8",
);

test("song schema has durable audio and analysis revision fields", () => {
  assert.match(migration, /add column if not exists audio_revision uuid/);
  assert.match(migration, /add column if not exists analysis_audio_revision uuid/);
  assert.match(migration, /alter column audio_revision set not null/);
  assert.match(migration, /new\.audio_path is distinct from old\.audio_path/);
  assert.match(migration, /new\.analysis_status = 'not_started'/);
  assert.match(migration, /new\.analysis = null/);
});

test("song client carries and uses the current audio revision", () => {
  assert.match(songHook, /audio_revision,analysis_audio_revision/);
  assert.match(songType, /audio_revision: string;/);
  assert.match(songType, /analysis_audio_revision: string \| null;/);
  assert.match(songPage, /const revision: string \| null = song\.audio_revision/);
  assert.match(songPage, /\.eq\("audio_revision",\s*revision\)/);
  assert.match(songPage, /analysis_audio_revision: revision/);
});

test("World Reveal rejects completed analysis from an older audio revision", () => {
  assert.match(
    worldPage,
    /song\.analysis_audio_revision !== song\.audio_revision/,
  );
});

test("server transcription rejects stale audio revisions and writes the bound revision", () => {
  assert.match(analyzer, /requestedAudioRevision/);
  assert.match(analyzer, /song\.audio_revision/);
  assert.match(analyzer, /return json\(\{ error: "The audio track changed/);
  assert.match(analyzer, /analysis_audio_revision: requestedAudioRevision/);
  assert.match(
    analyzer,
    /\.eq\("audio_revision", requestedAudioRevision\)/,
  );
});
