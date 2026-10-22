import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/hooks/useSongInterpretation.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;

function hookFor(response) {
  const values = [];
  const calls = [];
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, Response, require(name) {
    if (name === 'react') return {
      useState(initial) {
        const index = values.length;
        values.push(initial);
        return [initial, (next) => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
      },
      useCallback: (fn) => fn,
      useEffect() {},
    };
    if (name === '../lib/supabase/client') return { supabase: { functions: {
      async invoke(name, options) { calls.push({ name, ...options.body }); return response; },
    } } };
    throw new Error('Unexpected dependency ' + name);
  } });
  return { hook: module.exports.useSongInterpretation('project', 'song', null), calls,
    state: () => ({ drafts: values[0], loading: values[1], working: values[2], error: values[3], manualFallback: values[4] }) };
}

function httpError(payload, status = 503) {
  const error = new Error('Edge Function returned a non-2xx status code');
  error.context = new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status });
  return error;
}

test('proposal exposes provider setup response and keeps manual editing available', async () => {
  const error = httpError({ error: { code: 'PROVIDER_COST_UNVERIFIED',
    message: 'AI interpretation is unavailable until a no-charge provider is verified.' }, manual_fallback: true });
  const h = hookFor({ data: null, error });
  assert.equal(await h.hook.propose(), null);
  assert.equal(h.state().error, 'AI interpretation is unavailable until a no-charge provider is verified.');
  assert.equal(h.state().manualFallback, true);
  assert.equal(h.state().working, false);
  assert.equal(h.calls.length, 1, 'an HTTP failure must not retry');
  assert.equal(error.context.bodyUsed, false, 'leave the original response readable');
});

test('all interpretation actions retain quota and stale-source server messages', async () => {
  for (const action of ['reload', 'saveDraft', 'propose', 'confirm']) {
    const message = action === 'confirm' ? 'This interpretation no longer matches the saved audio.' : 'The daily AI limit is reached or another request is in progress.';
    const h = hookFor({ data: null, error: httpError({ error: { code: 'GUARD_BLOCKED', message } }, 429) });
    await h.hook[action](action === 'saveDraft' ? { interpretation: {}, evidence: [] } : 'draft');
    assert.equal(h.state().error, message, action);
    assert.equal(h.state().working, false, action);
    if (action === 'reload') assert.equal(h.state().loading, false, action);
    assert.equal(h.state().manualFallback, false, 'quota failure is not missing provider setup');
    assert.equal(h.calls.length, 1);
  }
});

test('network and malformed HTTP failures keep a usable error without leaving work active', async () => {
  for (const error of [new Error('Failed to send a request to the Edge Function'), httpError('<html>Unavailable</html>')]) {
    const h = hookFor({ data: null, error });
    assert.equal(await h.hook.propose(), null);
    assert.equal(h.state().error, error.message);
    assert.equal(h.state().manualFallback, false);
    assert.equal(h.state().working, false);
  }
});

test('successful proposal preserves prior versions and stays unapproved', async () => {
  const draft = { id: 'new-draft', status: 'draft', version: 2 };
  const h = hookFor({ data: { draft }, error: null });
  const prior = { id: 'prior', status: 'draft', version: 1 };
  h.state().drafts.push(prior);
  assert.equal(await h.hook.propose(), draft);
  assert.deepEqual(Array.from(h.state().drafts), [draft, prior]);
  assert.equal(h.state().working, false);
  assert.equal(h.state().error, null);
  assert.equal(h.hook.confirmed, null);
  assert.equal(h.calls[0].action, 'propose');
});
