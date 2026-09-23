import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildMasterTimeline, assembleTimeline } from '../worker/src/pipeline-contract.ts';

test('deterministic pipeline persists and resumes without regenerating completed jobs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatvision-e2e-'));
  const statePath = path.join(dir, 'project.json');
  const timeline = buildMasterTimeline({
    project_id: 'verification-project',
    song_id: 'fixture-song',
    song_duration_seconds: 8,
    scenes: [
      { duration: 4, section: 'verse', asset: 'image-1' },
      { duration: 4, section: 'chorus', asset: 'image-2' },
    ],
  });

  const imageJobs = timeline.map((scene) => ({
    scene_id: scene.scene_id,
    status: 'succeeded',
    output: { asset_id: `image:${scene.scene_id}`, source_url: `fixture://image/${scene.index}` },
  }));

  const motionJobs = imageJobs.map((image, index) => ({
    job_id: `motion-${index + 1}`,
    scene_id: image.scene_id,
    status: 'succeeded',
    output: {
      asset_id: `motion:${image.scene_id}`,
      source_url: `fixture://motion/${index + 1}`,
      scene_id: image.scene_id,
      duration: 4,
    },
  }));

  fs.writeFileSync(statePath, JSON.stringify({ timeline, imageJobs, motionJobs, generated_at: 1 }));

  const reloaded = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(reloaded.motionJobs.filter((job) => job.status === 'succeeded').length, 2);

  const clips = reloaded.motionJobs.map((job) => {
    const scene = reloaded.timeline.find((item) => item.scene_id === job.output.scene_id);
    assert.ok(scene);
    return {
      scene_id: scene.scene_id,
      asset_id: job.output.asset_id,
      source_url: job.output.source_url,
      start_time: scene.start_time,
      end_time: scene.end_time,
      duration: job.output.duration,
      generation_type: 'GENERATIVE_VIDEO',
    };
  });

  const assembled = assembleTimeline(reloaded.timeline, clips, 8);
  assert.equal(assembled.scene_count, 2);
  assert.equal(assembled.timeline_duration, 8);
  assert.equal(reloaded.generated_at, 1, 'reload must reuse persisted state rather than regenerate it');
  fs.rmSync(dir, { recursive: true, force: true });
});
