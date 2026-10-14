import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyFinalMedia } from '../../supabase/functions/beatvision-generation/final-media.ts';

const fixture = await readFile(new URL('./fixtures/final-media-contract.mp4', import.meta.url));
const originalDeno = globalThis.Deno;
test.after(() => { globalThis.Deno = originalDeno; });
globalThis.Deno = { env: { get: () => 'output.test' } };

test('measures video/audio from actual MP4 bytes, without provider duration', async () => {
  const result = await verifyFinalMedia('https://output.test/video.mp4', 2, async (_, options) => {
    assert.equal(options.redirect, 'error');
    return new Response(fixture);
  });
  assert.equal(result.video_duration_seconds, 2);
  assert.ok(result.audio_duration_seconds >= 2);
});
test('rejects arbitrary URLs and missing planned duration before fetching', async () => {
  let calls = 0; const request = async () => { calls++; throw Error('unexpected'); };
  for (const url of ['https://other.test/a.mp4', 'http://output.test/a.mp4', 'https://user:pass@output.test/a.mp4', 'https://output.test:444/a.mp4']) {
    await assert.rejects(verifyFinalMedia(url, 2, request), /HOST_NOT_ALLOWED/);
  }
  await assert.rejects(verifyFinalMedia('https://output.test/a.mp4', undefined, request), /PLAN_DURATION_MISSING/);
  assert.equal(calls, 0);
});
test('rejects HTML, unreachable output, truncation and oversized output', async () => {
  for (const response of [new Response('<html>not video</html>'), new Response('', { status: 404 }), new Response(fixture.subarray(0, 1200)), new Response('', { headers: { 'content-length': String(51 * 1024 * 1024) } })]) {
    await assert.rejects(verifyFinalMedia('https://output.test/a.mp4', 2, async () => response));
  }
});
test('rejects wrong duration and absent audio instead of trusting plan metadata', async () => {
  await assert.rejects(verifyFinalMedia('https://output.test/a.mp4', 249, async () => new Response(fixture)), /DURATION_MISMATCH/);
  const silent = Buffer.from(fixture);
  const marker = silent.indexOf(Buffer.from('soun'));
  assert.ok(marker > 0); silent.write('xxxx', marker);
  await assert.rejects(verifyFinalMedia('https://output.test/a.mp4', 2, async () => new Response(silent)), /AUDIO_MISSING/);
});
