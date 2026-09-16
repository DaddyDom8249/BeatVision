import test from 'node:test';
import assert from 'node:assert/strict';
import { completeMotionJob, retryMotionJob } from './motion-job.ts';

const job = () => ({ job_id: 'j1', project_id: 'p1', stage: 'motion' as const, provider: 'deterministic-test', provider_job_id: 'provider-1', status: 'running' as const, retry_count: 0, max_retries: 2, idempotency_key: 'p1-scene-1', created_at: '', updated_at: '', error: null, output: null, input: {} });

test('transient motion errors retry within a bounded budget', () => {
  const retried = retryMotionJob(job(), 'temporary provider timeout', true);
  assert.equal(retried.status, 'polling');
  assert.equal(retried.retry_count, 1);
  const exhausted = retryMotionJob({ ...retried, retry_count: 2 }, 'permanent provider failure', true);
  assert.equal(exhausted.status, 'failed');
});

test('completed output is durable and idempotent', () => {
  const completed = completeMotionJob(job(), { asset_id: 'motion:j1:scene:1', source_url: 'fixture://motion-1' });
  assert.equal(completed.status, 'succeeded');
  assert.equal(completed.output?.asset_id, 'motion:j1:scene:1');
  assert.equal(completeMotionJob(completed, { asset_id: 'different' }).output?.asset_id, 'motion:j1:scene:1');
});
