import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {buildModalShotPrompt} from '../../supabase/functions/beatvision-generation/shot-direction.ts';
import {MODAL_MOTION, ModalMotionError, sha256Hex, assertModalFrameCount} from '../../supabase/functions/beatvision-generation/modal-motion.ts';

// Optional fixture checks the exact retrieved production controller offline.
// No provider request, renderer, credentials or global fetch is used.
const source = readFileSync(process.env.BRAGORA_MODAL_CONTROLLER_FIXTURE ||
  new URL('../../supabase/functions/beatvision-generation/index.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function modalBridgeSubmit(');
const end = source.indexOf('async function modalBridgePoll(', start);
assert.ok(start >= 0 && end > start, 'actual Modal submission function must exist');
const code = ts.transpileModule(source.slice(start, end), {
  compilerOptions: {target: ts.ScriptTarget.ES2022},
}).outputText;

function fixture(scene, approved = true, frames) {
  const project = '00000001-0000-4000-8000-000000000001';
  const imageId = '00000002-0000-4000-8000-000000000002';
  const filters = [], submissions = [], downloads = [];
  const query = {
    select() { return this; },
    eq(...args) { filters.push(args); return this; },
    async single() {
      return approved ? {data: {id: imageId, storage_path: project + '/scene-images/source.png'}}
        : {error: {message: 'No approved image'}};
    },
  };
  const image = new Uint8Array(64);
  image.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const db = {
    from(name) { assert.equal(name, 'scene_image_assets'); return query; },
    storage: {from(name) {
      assert.equal(name, 'visual-assets');
      return {async download(path) { downloads.push(path); return {data: new Blob([image])}; }};
    }},
  };
  const submit = async (payload, bytes) => {
    submissions.push({payload, bytes});
    return {status: 'processing', job_id: 'fc-offline-fixture'};
  };
  const run = new Function('buildModalShotPrompt', 'MODAL_MOTION', 'ModalMotionError', 'sha256Hex', 'submitModalMotion', 'assertModalFrameCount',
    code + '\nreturn modalBridgeSubmit;')(buildModalShotPrompt, MODAL_MOTION, ModalMotionError, sha256Hex, submit, assertModalFrameCount);
  const job = Object.freeze({id: '00000004-0000-4000-8000-000000000004',
    project_id: project, visual_plan_id: 'plan-fixture', visual_plan_scene_id: 'scene-fixture',
    input_snapshot: Object.freeze({scene: Object.freeze(scene), modal_motion: Object.freeze({
      model: MODAL_MOTION.model, revision: MODAL_MOTION.revision, source_image_id: imageId,
      ...(frames === undefined ? {} : {frames}),
    })}),
  });
  return {run: () => run(db, job), filters, submissions, downloads, image, imageId};
}

test('long visual prose cannot displace approved movement from the Modal prompt', async () => {
  const movement = 'Lift the left hand slowly while remaining beside the doorway.';
  const f = fixture({title: 'Subject at the doorway', movement_direction: movement,
    continuity_notes: 'Retain the approved blue coat.',
    visual_direction: 'ATMOSPHERE_ONLY '.repeat(250), location: 'Approved doorway', mood: 'Reflective'});
  const result = await f.run();
  assert.equal(result.data.request_validation.prompt,f.submissions[0].payload.prompt);
  assert.equal(result.data.request_validation.visual_quality,"unverified");
  assert.equal(result.data.request_validation.continuity_quality,"unverified");
  assert.deepEqual(result.data.request_validation.checks,{approved_source:"passed",direction:"passed",provider_contract:"passed"});
  assert.equal(f.submissions.length, 1);
  const {payload, bytes} = f.submissions[0];
  assert.ok(payload.prompt.includes(movement), 'do not cut the approved action behind atmosphere');
  assert.ok(!payload.prompt.includes('ATMOSPHERE_ONLY'), 'approved image carries appearance; omit competing prose');
  assert.ok(payload.prompt.includes('Preserve the approved characters'));
  assert.ok(payload.prompt.length <= 1600);
  assert.equal(payload.source_image_id, f.imageId);
  assert.equal(payload.image_sha256, await sha256Hex(f.image));
  assert.deepEqual(bytes, f.image);
  assert.ok(f.filters.some(([key, value]) => key === 'approved' && value === true));
  assert.ok(f.filters.some(([key, value]) => key === 'status' && value === 'approved'));
});

test('minimal approved action is preserved without inventing a stronger action', async () => {
  const movement = 'Minimal movement; keep the body still and look toward the door.';
  const f = fixture({movement_direction: movement});
  await f.run();
  assert.equal(f.submissions.length, 1);
  assert.ok(f.submissions[0].payload.prompt.includes(movement));
  assert.doesNotMatch(f.submissions[0].payload.prompt, /walk|run|jump|dance/i);
});

test('escaped production JSON becomes one restrained action and one camera instruction', async () => {
  const direction = {actor:'Lift the left hand slowly, restrained, occasional frantic motion', camera:'slow, deliberate, occasional jerky for tension'};
  for (const movement_direction of [direction,JSON.stringify(direction),JSON.stringify(direction).replaceAll('"','\\"')]) {
    const f = fixture({movement_direction,
      title:'Section 8 (262–264s)', location:'kitchen; bedroom; highway',
      camera_direction:{camera_movement:['handheld','dolly','static','slow pan']},
      visual_direction:'explosive chorus; dark ghosts; shaking', continuity_notes:'changing unrelated metadata'});
    await f.run();
    const prompt=f.submissions[0].payload.prompt;
    assert.match(prompt,/Action: Lift the left hand slowly, restrained/);
    assert.match(prompt,/Camera: slow, deliberate/);
    assert.doesNotMatch(prompt,/frantic|jerky|kitchen|bedroom|highway|Section|chorus|ghosts|handheld|dolly|static|pan|[{}\[\]\\"]/);
    assert.ok(prompt.length<=500);
  }
});

test('specific artist action and camera survive without replacement or mutation', async () => {
  const movement=Object.freeze({actor:'Keep the head still; lift only the left hand slowly.',camera:'Locked camera. No zoom.'});
  const f=fixture({movement_direction:movement});
  await f.run();
  assert.ok(f.submissions[0].payload.prompt.includes(movement.actor));
  assert.ok(f.submissions[0].payload.prompt.includes(movement.camera));
  assert.equal(movement.actor,'Keep the head still; lift only the left hand slowly.');
  assert.doesNotMatch(f.submissions[0].payload.prompt,/turn their head|walk|run|jump|dance/i);
});

test('ambiguous or invalid directions fail before paid submission rather than being truncated', async () => {
  for(const movement_direction of [null,'', '{keep this creator text',
    {actor:['Walk','Dance']}, {actor:'Walk or dance.'}, {actor:'No hat. Walk or dance.'},
    {actor:'Hold position.',camera:['Dolly in.','Pan left.']},
    {actor:'Move '.repeat(100)}]) {
    const f=fixture({movement_direction});
    await assert.rejects(f.run(),/MODAL_SHOT_DIRECTION_(REQUIRED|AMBIGUOUS|INVALID|TOO_LONG)/);
    assert.equal(f.submissions.length,0);
  }
});

test('plain creator movement remains literal and explicit camera fallback is supported', async () => {
  const movement='Hold position; do not move the left hand.';
  const f=fixture({movement_direction:movement,camera_direction:JSON.stringify({camera_movement:'Slow pan left.'})});
  await f.run();
  assert.ok(f.submissions[0].payload.prompt.startsWith('Action: '+movement));
  assert.match(f.submissions[0].payload.prompt,/Camera: Slow pan left/);
});

test('missing approved input still rejects before download or Modal submission', async () => {
  const f = fixture({movement_direction: 'Lift the left hand.'}, false);
  await assert.rejects(f.run(), /MODAL_APPROVED_IMAGE_REQUIRED/);
  assert.equal(f.downloads.length, 0);
  assert.equal(f.submissions.length, 0);
});


test('frozen long duration reaches the worker while legacy/default payloads stay compatible', async () => {
  for (const frames of [undefined, 49, 121, 161]) {
    const f = fixture({movement_direction: 'Lift the left hand.'}, true, frames);
    await f.run();
    assert.equal(f.submissions[0].payload.frames, frames > 49 ? frames : undefined);
  }
  const f = fixture({movement_direction: 'Lift the left hand.'}, true, 169);
  await assert.rejects(f.run(), /MODAL_FRAME_COUNT_INVALID/);
  assert.equal(f.submissions.length, 0);
});

test('broad global movements block before paid submission rather than becoming invented choreography', async () => {
 const f=fixture({movement_direction:JSON.stringify({actor:'subtle gestures, restrained, occasional frantic motion',camera:'slow, deliberate, occasional jerky for tension'}).replaceAll('"','\\"')});
 await assert.rejects(f.run(),/MODAL_SHOT_DIRECTION_TOO_GENERIC/);
 assert.equal(f.submissions.length,0);
});

test('negative constraints are preserved without becoming new movement',async()=>{
 const f=fixture({movement_direction:{actor:'Hold position; do not sway or jump.',camera:'Locked camera. No zoom.'}});
 await f.run(); assert.match(f.submissions[0].payload.prompt,/do not sway or jump/);
 assert.match(f.submissions[0].payload.prompt,/No zoom/);
});
