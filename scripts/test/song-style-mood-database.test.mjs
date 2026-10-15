import test from 'node:test';
import assert from 'node:assert/strict';
import { database, readMigration } from './pglite-runtime.mjs';

test('style/mood migration preserves drafts and grants only the additional creator column', async () => {
  const db = await database();
  try {
    await db.exec(await readMigration('20261014021500_owner_checked_analysis_writes.sql'));
    await db.exec(`insert into songs(title,artist,lyrics,creative_direction,notes)
      values('Fixture title','Fixture artist','Fixture lyrics','Original direction','Original notes')`);
    const migration = await readMigration('20261015041957_song_style_mood.sql');
    await db.exec(migration);
    await db.exec(migration);
    const original = (await db.query('select * from songs')).rows[0];
    assert.equal(original.style_mood, null);
    assert.equal(original.creative_direction, 'Original direction');
    await db.exec('set role authenticated');
    await db.query('update songs set style_mood=$1 where id=$2', ['Noir, resilient', original.id]);
    const saved = (await db.query('select style_mood,creative_direction,notes,audio_path from songs where id=$1', [original.id])).rows[0];
    assert.deepEqual(saved, { style_mood: 'Noir, resilient', creative_direction: 'Original direction', notes: 'Original notes', audio_path: null });
    await assert.rejects(db.query("update songs set analysis_status='completed'"), /permission denied/);
    await db.query('insert into songs(title,artist,lyrics,style_mood) values($1,$2,$3,$4)', ['New draft', 'Artist', 'Lyrics', 'Ink realism']);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query("update songs set style_mood='Unauthorized'"), /permission denied/);
  } finally {
    await db.close();
  }
});
