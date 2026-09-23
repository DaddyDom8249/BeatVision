import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleTimeline, buildMasterTimeline } from './pipeline-contract.ts';

test('master timeline covers song duration and assigns stable scene identity', () => {
  const scenes = buildMasterTimeline({ project_id: 'p1', song_id: 's1', song_duration_seconds: 10, scenes: [{ duration: 4, section: 'verse' }, { duration: 6, section: 'chorus' }] });
  assert.equal(scenes.length, 2);
  assert.equal(scenes[0].start_time, 0);
  assert.equal(scenes[1].end_time, 10);
  assert.notEqual(scenes[0].scene_id, scenes[1].scene_id);
  assert.equal(buildMasterTimeline({ project_id: 'p1', song_id: 's1', song_duration_seconds: 10, scenes: [{ duration: 4, section: 'verse' }, { duration: 6, section: 'chorus' }] })[0].scene_id, scenes[0].scene_id);
});

test('assembly rejects missing assets and accidental adjacent recycling', () => {
  const scenes = buildMasterTimeline({ project_id: 'p1', song_id: 's1', song_duration_seconds: 8, scenes: [{ duration: 4 }, { duration: 4 }] });
  const base = (asset_id: string) => ({ scene_id: scenes[0].scene_id, asset_id, source_url: `https://test/${asset_id}.mp4`, start_time: 0, end_time: 4, duration: 4, generation_type: 'GENERATIVE_VIDEO' as const });
  assert.throws(() => assembleTimeline(scenes, [base('a')], 8), /ASSEMBLY_MISSING_ASSET/);
  assert.throws(() => assembleTimeline(scenes, [base('a'), { ...base('a'), scene_id: scenes[1].scene_id, start_time: 4, end_time: 8 }], 8), /ASSEMBLY_ACCIDENTAL_ADJACENT_REUSE/);
  const result = assembleTimeline(scenes, [base('a'), { ...base('b'), scene_id: scenes[1].scene_id, start_time: 4, end_time: 8 }], 8);
  assert.equal(result.timeline_duration, 8);
});
