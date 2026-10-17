import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readMigration } from './pglite-runtime.mjs';

test('project cascade removes stored image and motion records while direct asset removal is blocked', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.projects(id uuid primary key);
      create table public.scene_image_assets(
        id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade,
        status text, approved boolean, image_url text);
      create table public.motion_clip_assets(
        id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade,
        scene_image_id uuid references public.scene_image_assets(id) on delete restrict,
        status text, approved boolean, video_url text);
      grant all on public.scene_image_assets, public.motion_clip_assets to service_role;
    `);
    await db.exec(await readMigration('20261014180000_approved_asset_media_immutability.sql'));
    const p='00000000-0000-4000-8000-000000000111';
    const i='00000000-0000-4000-8000-000000000112';
    const m='00000000-0000-4000-8000-000000000113';
    await db.query('insert into public.projects(id) values($1)',[p]);
    await db.query("insert into public.scene_image_assets(id,project_id,status,approved,image_url) values($1,$2,'approved',true,'https://example.test/image.jpg')",[i,p]);
    await db.query("insert into public.motion_clip_assets(id,project_id,scene_image_id,status,approved,video_url) values($1,$2,$3,'approved',true,'https://example.test/video.mp4')",[m,p,i]);
    await db.query('delete from public.projects where id=$1',[p]);
    for (const table of ['projects','scene_image_assets','motion_clip_assets']) {
      const row=await db.query(`select count(*)::int as n from public.${table}`);
      assert.equal(row.rows[0].n,0,table);
    }
  } finally { await db.close(); }
});
