import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGeneration } from './generation-runtime.mjs';

function fixture() {
  const job = { id: 'assembly', project_id: 'project-1', visual_plan_id: 'plan-1', job_type: 'assembly',
    input_snapshot: { plan: { duration_seconds: 8 }, audio_path: 'song/audio.wav',
      vision_snapshot: { song: { analysis: { duration_seconds: 8 } } },
      scenes: [{ id: 'scene-1', scene_number: 1, start_time: 0, end_time: 8 }],
      motion_clips: [{ asset_id: 'clip-1', scene: 1, video_url: 'https://expired.test/clip.mp4', generation_type: 'GENERATIVE_VIDEO' }] } };
  const asset = { id: 'clip-1', project_id: 'project-1', visual_plan_id: 'plan-1', scene_id: 'scene-1',
    generation_job_id: 'motion-job', approved: true, status: 'approved' };
  const motionJob = { id: 'motion-job', project_id: 'project-1', visual_plan_id: 'plan-1',
    visual_plan_scene_id: 'scene-1', status: 'completed', job_type: 'scene_motion',
    output: { arena_status_response: { result: {
      storage_path: 'project-1/scene-motion/plan-1/scene-1/motion-job.mp4',
      verification: { container_verified: true, video_duration_seconds: 8 },
    } } } };
  const queries = [], signs = [];
  const state = { signingError: false };
  const db = {
    from(table) {
      const filters = {};
      return { select() { return this; }, eq(k,v) { filters[k]=v; return this; }, in(k,v) { filters[k]=v; return this; },
        then(resolve) {
          queries.push({table,filters});
          return Promise.resolve({data: table === 'motion_clip_assets' ? [asset] : [motionJob], error: null}).then(resolve);
        } };
    },
    storage: { from(bucket) { return { async createSignedUrl(path, ttl) {
      signs.push({bucket,path,ttl});
      return state.signingError ? {error:{message:'Unavailable'}} : {data:{signedUrl:'https://fresh.test/'+bucket+'/'+path}};
    } }; } },
  };
  return { job, asset, motionJob, db, queries, signs, state };
}

async function check(f, fn) {
  const runtime = await loadGeneration(f.db, {}, process.env.ASSEMBLY_CONTROLLER_SOURCE);
  try { await fn(runtime); } finally { await runtime.cleanup(); }
}

test('assembly renews the exact frozen private asset without changing its snapshot', async () => {
  const f=fixture(), before=structuredClone(f.job);
  await check(f, async r => {
    const payload=await r.bridgePayload(f.db,f.job);
    assert.equal(payload.motion.clips[0].video_url,'https://fresh.test/visual-assets/project-1/scene-motion/plan-1/scene-1/motion-job.mp4');
    assert.equal(payload.motion.clips[0].asset_id,'clip-1');
    assert.deepEqual(f.job,before);
    assert.equal(f.signs.filter(x=>x.bucket==='visual-assets').length,1);
    for (const q of f.queries) { assert.equal(q.filters.project_id,'project-1'); assert.equal(q.filters.visual_plan_id,'plan-1'); }
  });
});

test('two-second proof cannot cover an eight-second scene, even if requested duration says eight', async () => {
  const f=fixture(); f.motionJob.output.arena_status_response.result.verification.video_duration_seconds=2;
  f.motionJob.output.arena_status_response.result.duration_seconds=8;
  f.job.input_snapshot.motion_clips[0].requested_duration_seconds=8;
  await check(f, r=>assert.rejects(r.bridgePayload(f.db,f.job),/ASSEMBLY_CLIP_TOO_SHORT.*scene=1.*actual=2\.000.*required=8\.000/));
  assert.equal(f.signs.length,0,'coverage rejected before any signing/provider dispatch');
});

test('unknown measured duration fails closed rather than substituting requested duration', async () => {
  const f=fixture(); delete f.motionJob.output.arena_status_response.result.verification;
  f.motionJob.output.arena_status_response.result.duration_seconds=8;
  await check(f,r=>assert.rejects(r.bridgePayload(f.db,f.job),/ASSEMBLY_DURATION_UNVERIFIED/));
});

for (const defect of ['project','plan','scene','job','approval','path','missing']) {
  test('assembly refuses mismatched frozen media provenance: '+defect, async () => {
    const f=fixture();
    if(defect==='project') f.asset.project_id='other-project';
    if(defect==='plan') f.asset.visual_plan_id='other-plan';
    if(defect==='scene') f.motionJob.visual_plan_scene_id='other-scene';
    if(defect==='job') f.motionJob.status='processing';
    if(defect==='approval') f.asset.approved=false;
    if(defect==='path') f.motionJob.output.arena_status_response.result.storage_path='other-project/secret.mp4';
    if(defect==='missing') f.asset.id='other-asset';
    await check(f,r=>assert.rejects(r.bridgePayload(f.db,f.job),/ASSEMBLY_(MOTION_PROVENANCE_INVALID|MOTION_PATH_INVALID)/));
    assert.equal(f.signs.length,0);
  });
}

test('failed signing cannot fall back to the expired URL', async () => {
  const f=fixture(); f.state.signingError=true;
  await check(f,r=>assert.rejects(r.bridgePayload(f.db,f.job),/ASSEMBLY_MOTION_SIGNING_FAILED/));
});

test('duplicate or gapped storyboard scenes are rejected without provider calls', async () => {
  const f=fixture(); f.job.input_snapshot.scenes[0].start_time=1;
  await check(f,r=>assert.rejects(r.bridgePayload(f.db,f.job),/ASSEMBLY_TIMELINE_INVALID/));
});
