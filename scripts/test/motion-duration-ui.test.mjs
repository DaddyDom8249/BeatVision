import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../../src/pages/ProductionWorkspacePage.tsx',import.meta.url),'utf8');

test('Production Workspace shows saved LTX provenance separately from a Wan pilot',()=>{
  assert.match(page,/Saved generative motion · Provider:/);
  assert.match(page,/Separate Wan 2\.2 image-to-video preview \(not the saved LTX motion clip\)/);
  assert.match(page,/\.select\("id,status,error,job_type,output,input_snapshot"\)/);
  assert.match(page,/motionAssetJob\?\.input_snapshot\?\.hf_motion\?\.duration_seconds/);
});
test('Actual saved and Wan durations are decoded from the media rather than a request',()=>{
  assert.match(page,/event\.currentTarget\.duration/g);
  assert.match(page,/setMotionMeasured\(\{ assetId: motion\.id, seconds \}\)/);
  assert.match(page,/setPilotMeasured\(\{ url: freePilotUrl, seconds \}\)/);
  assert.match(page,/Decoded clip /);
  assert.match(page,/Decoded preview duration:/);
});
test('Missing scene coverage is explicit and no extra generation is launched',()=>{
  assert.match(page,/Remaining uncovered scene time:/);
  assert.match(page,/Additional approved AI clips required\./);
  assert.match(page,/Only the existing job is polled; no new generation is submitted/);
  const statusEffect=page.slice(page.indexOf('if (!freePilotJob || freePilotJob.sceneId !== scene?.id)'),page.indexOf('const checkMotionStatus ='));
  assert.doesNotMatch(statusEffect,/generateFreePilot\(/);
});
