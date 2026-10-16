import test from 'node:test';
import assert from 'node:assert/strict';
import { database, readMigration } from './pglite-runtime.mjs';

const id = {
  owner: '11111111-1111-4111-8111-111111111111',
  other: '22222222-2222-4222-8222-222222222222',
  project: '33333333-3333-4333-8333-333333333333',
  song: '44444444-4444-4444-8444-444444444444',
  revisionA: '55555555-5555-4555-8555-555555555555',
  revisionB: '66666666-6666-4666-8666-666666666666'
};
let db;
test.before(async () => {
  db = await database();
  await db.exec(`
    alter table projects add column song_duration numeric;
    alter table songs drop column audio_revision;
    alter table songs add column audio_revision uuid;
    alter table songs add column analysis_audio_revision uuid;
    insert into projects(id,owner_id,song_duration)
      values ('${id.project}','${id.owner}',249);
    insert into songs(id,project_id,audio_path,audio_revision,analysis_status,analysis)
      values ('${id.song}','${id.project}','track-A.mp3','${id.revisionA}','analyzing',
      '{"duration_seconds":249}');
  `);
  await db.exec(await readMigration('20261016032000_atomic_song_transcription_revision.sql'));
});
test.after(async () => db?.close());
test.beforeEach(async () => db.exec('begin'));
test.afterEach(async () => db.exec('rollback'));

const params = (overrides={}) => ({
  project: id.project, song: id.song, actor: id.owner,
  revision: id.revisionA, path: 'track-A.mp3',
  analysis: { duration_seconds: 249, transcript: 'Track A words' }, duration: 249,
  ...overrides
});
async function complete(p={}) {
  const v=params(p);
  const result=await db.query(
    'select complete_song_transcription($1,$2,$3,$4,$5,$6::jsonb,$7) as accepted',
    [v.project,v.song,v.actor,v.revision,v.path,JSON.stringify(v.analysis),v.duration]
  );
  return result.rows[0].accepted;
}
async function snapshot() {
  const song=(await db.query('select analysis_status,analysis,audio_revision,analysis_audio_revision from songs where id=$1',[id.song])).rows[0];
  const project=(await db.query('select song_duration from projects where id=$1',[id.project])).rows[0];
  return {song,project};
}
test('accepted matching revision persists transcript and duration atomically',async()=>{
  assert.equal(await complete(),true);
  const state=await snapshot();
  assert.equal(state.song.analysis.transcript,'Track A words');
  assert.equal(Number(state.project.song_duration),249);
  assert.equal(state.song.analysis_audio_revision,id.revisionA);
  assert.equal(state.song.analysis_status,'completed');
});
test('replacement during inference rejects both stale transcript and stale project duration',async()=>{
  await db.query('update songs set audio_path=$1,audio_revision=$2,analysis=$3,analysis_status=$4 where id=$5',
    ['track-B.mp3',id.revisionB,{duration_seconds:73},'analyzing',id.song]);
  await db.query('update projects set song_duration=73 where id=$1',[id.project]);
  const before=await snapshot();
  assert.equal(await complete(),false);
  assert.deepEqual(await snapshot(),before);
});
test('matching revision with changed path cannot persist',async()=>{
  await db.query("update songs set audio_path='new-path.mp3' where id=$1",[id.song]);
  const before=await snapshot();
  assert.equal(await complete(),false);
  assert.deepEqual(await snapshot(),before);
});
test('wrong owner has no path to modify another project',async()=>{
  const before=await snapshot();
  await assert.rejects(complete({actor:id.other}),/SONG_NOT_FOUND_OR_FORBIDDEN/);
  assert.deepEqual(await snapshot(),before);
});
test('invalid duration causes no partial update',async()=>{
  const before=await snapshot();
  await assert.rejects(complete({duration:0}),/SONG_DURATION_INVALID/);
  assert.deepEqual(await snapshot(),before);
});
test('browser role cannot call privileged transcription writer',async()=>{
  await db.exec('set local role authenticated');
  await assert.rejects(complete(),/permission denied/i);
});
