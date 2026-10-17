import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBranch } from '../prune-merged-branches.mjs';

const branch = { name: 'repair/merged-safe', commit: { sha: 'abc123' }, protected: false };
const merged = new Set(['repair/merged-safe\0abc123']);
const noOpen = new Set();
const ancestor = { status: 'behind', ahead_by: 0 };
const allowed = (b = branch, open = noOpen, history = merged, comparison = ancestor) =>
  classifyBranch(b, open, history, comparison);

test('only exactly merged and reachable branch heads are eligible', () => {
  assert.equal(allowed(), null);
});
test('never prune protected, main, archived or release branches', () => {
  for (const name of ['main', 'archive/snapshot', 'release/stable']) {
    assert.ok(allowed({ ...branch, name }));
  }
  assert.equal(allowed({ ...branch, protected: true }), 'protected branch');
});
test('never prune a branch used as an open PR head or base', () => {
  assert.equal(allowed(branch, new Set([branch.name])), 'referenced by an open PR');
});
test('never prune a branch without the exact merged PR head SHA', () => {
  assert.equal(allowed({ ...branch, commit: { sha: 'different' } }), 'head has no identical merged PR');
  assert.equal(allowed(branch, noOpen, new Set()), 'head has no identical merged PR');
});
test('never prune diverged or unverified history', () => {
  for (const c of [null, {}, { status: 'diverged', ahead_by: 2 }, { status: 'ahead', ahead_by: 1 }]) {
    assert.equal(allowed(branch, noOpen, merged, c), 'head not proven reachable from main');
  }
});
test('never prune incomplete branch records', () => {
  assert.equal(allowed({name:'unknown'}), 'incomplete branch record');
});
