import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../../src/pages/ProductionWorkspacePage.tsx',import.meta.url),'utf8');
test('Saved LTX clip duration is measured and distinct from its requested duration',()=>{
  assert.match(page,/Two seconds requested; actual media duration is measured below/);
  assert.match(page,/motionAssetJob\?\.input_snapshot\?\.hf_motion\?\.duration_seconds/);
  assert.match(page,/event\.currentTarget\.duration/);
  assert.match(page,/setMotionMeasured\(\{ assetId: motion\.id, seconds \}\)/);
  assert.match(page,/Remaining uncovered scene time:/);
});
test('Original approved variant remains selected and reported rather than newer failed retry',()=>{
  assert.match(page,/selectedMotion\?\.generation_job_id/);
  assert.match(page,/setMotionAssetJob\(sourceJob\)/);
  assert.match(page,/motionHistory\.map/);
});
test('Wan preview shows actual duration without enqueuing a continuation',()=>{
  assert.match(page,/Temporary Wan 2\.2 preview/);
  assert.match(page,/setPilotMeasured\(\{ url: freePilotUrl, seconds \}\)/);
  assert.match(page,/Decoded preview duration:/);
  assert.match(page,/Only the existing job is polled; no new generation is submitted/);
});
