// Pipeline canvas: pure graph model + presentational component render.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const dir = await mkdtemp(join(rootDir, '.canvas-test-'));
after(() => rm(dir, { recursive: true, force: true }));
const opts = { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } };
const model = await readFile(join(rootDir, 'src/lib/beatvision/pipelineCanvas.ts'), 'utf8');
await writeFile(join(dir, 'model.mjs'), ts.transpileModule(model, opts).outputText);
const comp = await readFile(join(rootDir, 'src/components/canvas/PipelineCanvas.tsx'), 'utf8');
await writeFile(join(dir, 'comp.mjs'), ts.transpileModule(comp.replace('"../../lib/beatvision/pipelineCanvas"', '"./model.mjs"'), opts).outputText);
const { buildPipelineGraph, statusOf, finalStatus } = await import(pathToFileURL(join(dir, 'model.mjs')).href);
const PipelineCanvas = (await import(pathToFileURL(join(dir, 'comp.mjs')).href)).default;

const input = () => ({
  sections: [{ index: 1, start_time: 20, end_time: 40 }, { index: 0, start_time: 0, end_time: 20 }],
  scenes: [
    { id: 's2', scene_number: 2, section_index: 1, start_time: 20, end_time: 40, title: 'Chorus', status: 'approved', location: 'Neon Alley', visual_direction: 'Mara runs', continuity_notes: '' },
    { id: 's1', scene_number: 1, section_index: 0, start_time: 0, end_time: 20, title: 'Intro', status: 'draft', location: 'Rooftop', visual_direction: '', continuity_notes: '' },
    { id: 's3', scene_number: 3, section_index: null, start_time: 40, end_time: 50, title: 'Outro', status: 'approved' },
  ],
  characters: [{ id: 'c1', name: 'Mara', status: 'approved' }],
  environments: [{ id: 'e1', name: 'Neon Alley', status: 'draft' }],
  references: [{ id: 'r1', label: 'Mood board' }],
  referencesApproved: true,
  sceneImages: [{ id: 'i1', scene_id: 's2', status: 'approved', approved: true }, { id: 'i2', scene_id: 's1', status: 'generated', approved: false }],
  motionClips: [{ id: 'm1', scene_id: 's2', status: 'failed', approved: false }],
  finalVideo: null,
});

test('statusOf: approved > pending > missing; all-failed counts as missing', () => {
  assert.equal(statusOf([]), 'missing');
  assert.equal(statusOf([{ status: 'failed', approved: false }]), 'missing');
  assert.equal(statusOf([{ status: 'generated', approved: false }]), 'pending');
  assert.equal(statusOf([{ status: 'draft', approved: false }, { status: 'approved', approved: true }]), 'approved');
  assert.equal(statusOf([{ status: 'approved' }]), 'approved');
  // An approved status without the approved flag is not treated as approved.
  assert.equal(statusOf([{ status: 'approved', approved: false }]), 'pending');
});

test('finalStatus maps render state', () => {
  assert.equal(finalStatus(null), 'missing');
  assert.equal(finalStatus({ id: 'f', render_status: 'processing', video_url: null }), 'pending');
  assert.equal(finalStatus({ id: 'f', render_status: 'completed', video_url: 'https://x/v.mp4' }), 'approved');
  assert.equal(finalStatus({ id: 'f', render_status: 'failed', video_url: null }), 'missing');
});

test('buildPipelineGraph maps sections → scenes → assets', () => {
  const g = buildPipelineGraph(input());
  assert.deepEqual(g.sections.map((s) => s.index), [0, 1]);
  assert.deepEqual(g.sections[0].scenes.map((s) => s.id), ['s1']);
  assert.deepEqual(g.unassigned.map((s) => s.id), ['s3']);
  const chorus = g.sections[1].scenes[0];
  assert.equal(chorus.status, 'approved');
  const kinds = Object.fromEntries(chorus.assets.map((a) => [a.kind, a.status]));
  assert.deepEqual(kinds, { character: 'approved', environment: 'pending', storyboard: 'approved', motion: 'missing' });
  const intro = g.sections[0].scenes[0];
  assert.equal(intro.status, 'pending');
  assert.equal(intro.assets.find((a) => a.kind === 'storyboard').status, 'pending');
  assert.equal(g.final.status, 'missing');
  assert.equal(g.shared.find((a) => a.kind === 'reference').status, 'approved');
  // shared: 3 (c approved, e pending, r approved); scenes: 3x storyboard + motion; final missing
  assert.deepEqual(g.summary, { approved: 3, pending: 2, missing: 5 });
});

test('buildPipelineGraph handles an empty project', () => {
  const g = buildPipelineGraph({ sections: [], scenes: [], characters: [], environments: [], references: [], referencesApproved: false, sceneImages: [], motionClips: [], finalVideo: null });
  assert.equal(g.sections.length, 0);
  assert.equal(g.final.status, 'missing');
});

test('PipelineCanvas renders sections, scenes and status badges', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(PipelineCanvas, { graph: buildPipelineGraph(input()) })));
  assert.equal(document.querySelectorAll('[data-testid="pc-section"]').length, 3);
  assert.equal(document.querySelectorAll('[data-testid="pc-scene"]').length, 3);
  assert.match(document.body.textContent, /Unmapped scenes/);
  assert.match(document.body.textContent, /Scene 2: Chorus/);
  assert.ok(document.querySelector('[data-kind="final"] [data-status="missing"]'));
  assert.ok(document.querySelector('[data-kind="character"] [data-status="approved"]'));
  await act(async () => root.unmount());
});
