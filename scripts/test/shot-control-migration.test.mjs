import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../../supabase/migrations/20261014060000_shot_control_retakes.sql', import.meta.url), 'utf8');

test('migration is flagged as requiring manual apply', () => {
  assert.match(sql, /REQUIRES MANUAL APPLY/);
});

test('database enforces one approved take per scene for images and motion', () => {
  assert.match(sql, /unique index[^;]*scene_image_assets\(visual_plan_id, scene_id\) where approved/);
  assert.match(sql, /unique index[^;]*motion_clip_assets\(visual_plan_id, scene_id\) where approved/);
  assert.match(sql, /SCENE_IMAGE_ALREADY_APPROVED/);
  assert.match(sql, /MOTION_CLIP_ALREADY_APPROVED/);
});

test('replace RPCs demand the expected current take, demote without deleting, and protect motion lineage', () => {
  for (const fn of ['replace_approved_scene_image', 'replace_approved_motion_clip']) {
    const body = sql.slice(sql.indexOf(`function public.${fn}`), sql.indexOf('$$;', sql.indexOf(`function public.${fn}`)));
    assert.match(body, /security definer/);
    assert.match(body, /owner_id = auth\.uid\(\)/);
    assert.match(body, /is distinct from p_expected_current_id/);
    assert.match(body, /set status = 'generated', approved = false/);
  }
  assert.match(sql, /SCENE_IMAGE_HAS_APPROVED_MOTION/);
  assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
});

test('keyframe writes only go through an owner-checked RPC limited to the scene\'s own takes', () => {
  assert.match(sql, /revoke insert, update, delete on public\.scene_keyframe_selections from anon, authenticated/);
  assert.match(sql, /a\.scene_id = p_scene_id/);
  assert.match(sql, /grant execute on function public\.set_scene_keyframe\(uuid, text, uuid\) to authenticated/);
});
