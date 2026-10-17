import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readMigration } from './pglite-runtime.mjs';

const owner = '00000000-0000-4000-8000-000000000001';
const outsider = '00000000-0000-4000-8000-000000000002';
const migration = '20261014190000_replay_songs_storage_owner_policies.sql';
const setUser = (id) => `set request.jwt.claim.sub = '${id}'`;

test('songs bucket migration replays live owner policies, is idempotent and rejects cross-user writes', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create schema storage;
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table storage.objects(
        id uuid primary key default gen_random_uuid(),
        bucket_id text not null,
        name text not null
      );
      alter table storage.objects enable row level security;
      grant usage on schema auth,storage to authenticated;
      grant execute on function auth.uid() to authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
    `);

    await db.exec(`set role authenticated; ${setUser(owner)}`);
    await assert.rejects(
      db.query(`insert into storage.objects(bucket_id,name) values('songs','${owner}/a/song.wav')`),
      /row-level security/i,
      'fresh replay without songs policies must reject authenticated uploads',
    );

    await db.exec('reset role');
    const sql = await readMigration(migration);
    await db.exec(sql);
    await db.exec(sql); // Existing production policy names must be preserved.
    const found = await db.query(`
      select policyname, cmd from pg_policies
      where schemaname='storage' and tablename='objects'
      order by policyname
    `);
    assert.deepEqual(found.rows.map((p) => p.cmd).sort(), ['DELETE','INSERT','SELECT','UPDATE']);
    assert.equal(found.rows.length, 4);

    await db.exec(`set role authenticated; ${setUser(owner)}`);
    await db.query(`insert into storage.objects(bucket_id,name) values('songs','${owner}/a/song.wav')`);
    await assert.rejects(
      db.query(`insert into storage.objects(bucket_id,name) values('songs','${outsider}/a/song.wav')`),
      /row-level security/i,
    );
    await assert.rejects(
      db.query(`insert into storage.objects(bucket_id,name) values('visual-assets','${owner}/a/image.jpg')`),
      /row-level security/i,
    );
    await assert.rejects(
      db.query(`update storage.objects set name='${outsider}/a/stolen.wav' where name='${owner}/a/song.wav'`),
      /row-level security/i,
      'authenticated users must not change an object into another user folder',
    );
    await db.exec(setUser(outsider));
    await db.query(`insert into storage.objects(bucket_id,name) values('songs','${outsider}/a/other.wav')`);
    const visibleToOutsider = await db.query('select name from storage.objects');
    assert.deepEqual(visibleToOutsider.rows.map((r) => r.name), [`${outsider}/a/other.wav`]);
    const forbiddenDelete = await db.query(`delete from storage.objects where name='${owner}/a/song.wav' returning id`);
    assert.equal(forbiddenDelete.rows.length, 0);

    await db.exec(setUser(owner));
    const own = await db.query('select name from storage.objects');
    assert.deepEqual(own.rows.map((r) => r.name), [`${owner}/a/song.wav`]);
    const deleted = await db.query(`delete from storage.objects where name='${owner}/a/song.wav' returning id`);
    assert.equal(deleted.rows.length, 1);
  } finally {
    await db.close();
  }
});
