import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStoryboard } from '../src/lib/beatvision/generationContract.ts';

test('rejects empty storyboards', () => {
  assert.throws(() => validateStoryboard([]), /no visual beats/i);
});

test('rejects overlapping beats', () => {
  assert.throws(() => validateStoryboard([
    { beatId:'a',scene_number:1,startTime:0,endTime:5,duration_seconds:5,description:'a',symbolicElements:[],cameraIntent:'',transitionIntent:'',worldConstraints:[],visualContinuityRequirements:[],reusePolicy:'new_visual_event' },
    { beatId:'b',scene_number:2,startTime:4,endTime:8,duration_seconds:4,description:'b',symbolicElements:[],cameraIntent:'',transitionIntent:'',worldConstraints:[],visualContinuityRequirements:[],reusePolicy:'new_visual_event' },
  ]), /overlaps/i);
});

test('rejects incomplete song coverage', () => {
  assert.throws(() => validateStoryboard([
    { beatId:'a',scene_number:1,startTime:0,endTime:4,duration_seconds:4,description:'a',symbolicElements:[],cameraIntent:'',transitionIntent:'',worldConstraints:[],visualContinuityRequirements:[],reusePolicy:'new_visual_event' },
  ], 8), /cover the full song/i);
});

test('accepts complete deterministic coverage', () => {
  assert.doesNotThrow(() => validateStoryboard([
    { beatId:'a',scene_number:1,startTime:0,endTime:4,duration_seconds:4,description:'a',symbolicElements:[],cameraIntent:'',transitionIntent:'',worldConstraints:[],visualContinuityRequirements:[],reusePolicy:'new_visual_event' },
    { beatId:'b',scene_number:2,startTime:4,endTime:8,duration_seconds:4,description:'b',symbolicElements:[],cameraIntent:'',transitionIntent:'',worldConstraints:[],visualContinuityRequirements:[],reusePolicy:'new_visual_event' },
  ], 8));
});
