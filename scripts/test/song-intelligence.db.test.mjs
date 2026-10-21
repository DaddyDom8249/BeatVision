import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readMigration } from "./pglite-runtime.mjs";

const ids = {
  owner: "10000000-0000-4000-8000-000000000001",
  other: "10000000-0000-4000-8000-000000000002",
  project: "10000000-0000-4000-8000-000000000003",
  song: "10000000-0000-4000-8000-000000000004",
  revision: "10000000-0000-4000-8000-000000000005",
  world: "10000000-0000-4000-8000-000000000006",
  style: "10000000-0000-4000-8000-000000000007",
};
const fingerprint = "b".repeat(64);
let db;

test.before(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
    create table projects(id uuid primary key, owner_id uuid, title text);
    create table songs(
      id uuid primary key, project_id uuid, title text, artist text, audio_path text,
      audio_revision uuid, analysis_status text, analysis jsonb, lyrics text,
      creative_direction text, notes text, updated_at timestamptz default now()
    );
    create table world_reports(id uuid primary key, project_id uuid, interpretation_id uuid, interpretation_source_fingerprint text);
    create table vision_locks(id uuid primary key, project_id uuid, world_report_id uuid, style_bible_id uuid, song_id uuid, revision_number integer, status text, snapshot jsonb);
    create table generation_jobs(id uuid primary key default gen_random_uuid(), project_id uuid, vision_lock_id uuid, job_type text, status text, input_snapshot jsonb);
    grant all on projects, songs, world_reports, vision_locks, generation_jobs to service_role;
    insert into projects values ('${ids.project}', '${ids.owner}', 'Fixture Project');
    insert into songs(id,project_id,title,artist,audio_path,audio_revision,analysis_status,analysis)
      values('${ids.song}','${ids.project}','Fixture Song','Fixture Artist','owner/project/song.wav','${ids.revision}','completed','{"duration_seconds":12}');
  `);
  await db.exec(await readMigration("20261020000000_song_intelligence.sql"));
  // Migration replay is part of the offline contract: a checked-out schema
  // must tolerate the same additive migration being applied again.
  await db.exec(await readMigration("20261020000000_song_intelligence.sql"));
});

test.after(async () => db?.close());
test.beforeEach(async () => db.exec("begin; set local role service_role;"));
test.afterEach(async () => db.exec("rollback;"));

const document = {
  schema_version: 1,
  summary: "The artist describes a tense return to self.",
  themes: ["return", "tension"],
  emotional_arc: "The tension opens into resolve.",
  visual_motifs: ["rain on glass"],
  narrative: "Artist-authored context.",
  claims: [{ text: "Tension gives way to resolve.", confidence: "artist_authored", evidence_refs: ["artist.note.1"] }],
};
const evidence = [{ id: "artist.note.1", kind: "artist", reference: "artist_note", excerpt: "The artist wants a tense return to self." }];

async function record() {
  return db.query("select record_song_source_fingerprint($1,$2,$3,$4,$5,$6) as ok", [
    ids.project, ids.song, ids.owner, ids.revision, fingerprint, 1234,
  ]);
}

test("server fingerprint is idempotent, owner-bound, and direct browser writes are denied", async () => {
  assert.equal((await record()).rows[0].ok, true);
  assert.equal((await record()).rows[0].ok, true);
  const song = (await db.query("select audio_source_fingerprint,audio_source_size from songs where id=$1", [ids.song])).rows[0];
  assert.equal(song.audio_source_fingerprint, fingerprint);
  assert.equal(Number(song.audio_source_size), 1234);
  await db.exec("set local role authenticated");
  await db.exec("savepoint browser_write");
  await assert.rejects(db.query("update songs set audio_source_fingerprint=$1 where id=$2", ["a".repeat(64), ids.song]), /permission denied/i);
  await db.exec("rollback to savepoint browser_write");
  await db.exec("set local role service_role");
  await db.exec("savepoint wrong_owner");
  await assert.rejects(db.query("select record_song_source_fingerprint($1,$2,$3,$4,$5,$6)", [ids.project, ids.song, ids.other, ids.revision, fingerprint, 1234]), /SONG_NOT_FOUND_OR_FORBIDDEN/);
  await db.exec("rollback to savepoint wrong_owner");
});

test("draft versions append immutable content, preserve confirmed history, and audit every transition", async () => {
  await record();
  const save = (value) => db.query("select * from save_song_interpretation_draft($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11::jsonb)", [
    ids.project, ids.song, ids.owner, ids.revision, fingerprint, JSON.stringify(value), JSON.stringify(evidence), "manual", "", "", "{}",
  ]);
  const first = (await save(document)).rows[0];
  assert.equal(first.version, 1);
  assert.equal(first.status, "draft");
  const second = (await save({ ...document, summary: "A revised artist reading." })).rows[0];
  assert.equal(second.version, 2);
  assert.equal((await db.query("select status from song_interpretations where id=$1", [first.id])).rows[0].status, "superseded");
  const confirmed = (await db.query("select * from confirm_song_interpretation($1,$2,$3,$4)", [ids.project, ids.song, second.id, ids.owner])).rows[0];
  assert.equal(confirmed.status, "confirmed");
  assert.equal((await db.query("select current_interpretation_id,interpretation_confirmed_at from songs where id=$1", [ids.song])).rows[0].current_interpretation_id, second.id);
  assert.equal(Number((await db.query("select count(*)::int as count from song_interpretation_audit_events where song_id=$1", [ids.song])).rows[0].count), 5);
  assert.deepEqual(
    (await db.query("select event_type from song_interpretation_audit_events where song_id=$1", [ids.song])).rows.map((row) => row.event_type).sort(),
    ["source_fingerprinted", "draft_created", "draft_superseded", "draft_created", "confirmed"].sort(),
  );
  await assert.rejects(db.query("select * from save_song_interpretation_draft($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11::jsonb)", [
    ids.project, ids.song, ids.owner, ids.revision, "c".repeat(64), JSON.stringify(document), JSON.stringify(evidence), "manual", "", "", "{}",
  ]), /SONG_INTERPRETATION_SOURCE_STALE/);
});

test("audio replacement clears the active interpretation without deleting its audit history", async () => {
  await record();
  const draft = (await db.query("select * from save_song_interpretation_draft($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11::jsonb)", [
    ids.project, ids.song, ids.owner, ids.revision, fingerprint, JSON.stringify(document), JSON.stringify(evidence), "manual", "", "", "{}",
  ])).rows[0];
  await db.query("select * from confirm_song_interpretation($1,$2,$3,$4)", [ids.project, ids.song, draft.id, ids.owner]);
  await db.query("update songs set audio_path=$1,audio_revision=$2 where id=$3", ["owner/project/new.wav", "10000000-0000-4000-8000-000000000008", ids.song]);
  const song = (await db.query("select audio_source_fingerprint,current_interpretation_id from songs where id=$1", [ids.song])).rows[0];
  assert.equal(song.audio_source_fingerprint, null);
  assert.equal(song.current_interpretation_id, null);
  assert.equal((await db.query("select count(*)::int as count from song_interpretation_audit_events where song_id=$1", [ids.song])).rows[0].count, 3);
});

test("new Vision Locks carry interpretation lineage while legacy locks remain readable but cannot queue new jobs", async () => {
  const legacyLock = (await db.query("insert into vision_locks(id,project_id,song_id,snapshot) values($1,$2,$3,'{}') returning *", ["10000000-0000-4000-8000-000000000008", ids.project, ids.song])).rows[0];
  await record();
  const draft = (await db.query("select * from save_song_interpretation_draft($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11::jsonb)", [
    ids.project, ids.song, ids.owner, ids.revision, fingerprint, JSON.stringify(document), JSON.stringify(evidence), "manual", "", "", "{}",
  ])).rows[0];
  await db.query("select * from confirm_song_interpretation($1,$2,$3,$4)", [ids.project, ids.song, draft.id, ids.owner]);
  const lock = (await db.query("insert into vision_locks(id,project_id,song_id,snapshot) values($1,$2,$3,'{}') returning *", ["10000000-0000-4000-8000-000000000009", ids.project, ids.song])).rows[0];
  assert.equal(lock.snapshot.interpretation_lineage.interpretation_id, draft.id);
  await db.query("insert into generation_jobs(project_id,vision_lock_id,job_type,status) values($1,$2,'scene_image','queued')", [ids.project, lock.id]);
  await assert.rejects(
    db.query("insert into generation_jobs(project_id,vision_lock_id,job_type,status) values($1,$2,'scene_image','queued')", [ids.project, legacyLock.id]),
    /GENERATION_INTERPRETATION_LINEAGE_REQUIRED/,
  );
});
