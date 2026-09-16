import test from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicMockProvider } from './provider-adapter.ts';

test('provider adapter completes queued-running-polling-succeeded-output lifecycle idempotently', async () => {
  const provider = new DeterministicMockProvider();
  const first = await provider.submit({ scene_id: 'scene-1' }, 'scene-1');
  const duplicate = await provider.submit({ scene_id: 'scene-1' }, 'scene-1');
  assert.equal(first.provider_job_id, duplicate.provider_job_id);
  assert.equal(provider.submitCalls, 1);
  assert.equal(await provider.getStatus(first.provider_job_id), 'RUNNING');
  assert.equal(await provider.getStatus(first.provider_job_id), 'SUCCEEDED');
  const output = await provider.getOutput(first.provider_job_id);
  assert.equal(output.provider_job_id, first.provider_job_id);
  assert.match(output.asset_id, /^motion-asset:/);
});

test('provider adapter exposes transient failure for retry and then success', async () => {
  const provider = new DeterministicMockProvider({ transientFailures: 1 });
  const job = await provider.submit({ scene_id: 'scene-2' }, 'scene-2');
  await assert.rejects(() => provider.getStatus(job.provider_job_id), /MOCK_TRANSIENT_PROVIDER_FAILURE/);
  assert.equal(await provider.getStatus(job.provider_job_id), 'SUCCEEDED');
});

test('provider adapter exposes permanent failure without fabricating output', async () => {
  const provider = new DeterministicMockProvider({ permanentFailure: true });
  const job = await provider.submit({ scene_id: 'scene-3' }, 'scene-3');
  assert.equal(await provider.getStatus(job.provider_job_id), 'FAILED');
});
