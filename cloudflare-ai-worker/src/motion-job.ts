export type MotionJobStatus = 'queued' | 'running' | 'polling' | 'succeeded' | 'failed' | 'cancelled';

export type MotionJob = {
  job_id: string;
  project_id: string;
  stage: 'motion';
  provider: string;
  provider_job_id: string | null;
  status: MotionJobStatus;
  retry_count: number;
  max_retries: number;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  error: string | null;
  output: Record<string, unknown> | null;
  input: Record<string, unknown>;
};

const now = () => new Date().toISOString();

export class BeatVisionMotionJob {
  state: any;
  env: any;
  constructor(state: any, env: any) { this.state = state; this.env = env; }
  async load(): Promise<MotionJob | null> { return (await this.state.storage.get('job')) || null; }
  async save(job: MotionJob) { job.updated_at = now(); await this.state.storage.put('job', job); }
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') return Response.json((await this.load()) || { status: 'not_found' });
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const existing = await this.load();
    if (existing) return Response.json(existing, { status: 200, headers: { 'X-BeatVision-Idempotent': 'true' } });
    const body: any = await request.json();
    const projectId = String(body?.project_id || '').trim();
    const idempotencyKey = String(body?.idempotency_key || '').trim();
    if (!projectId || !idempotencyKey) return Response.json({ ok: false, error: 'project_id and idempotency_key are required.' }, { status: 400 });
    const job: MotionJob = {
      job_id: String(body.job_id || crypto.randomUUID()),
      project_id: projectId,
      stage: 'motion',
      provider: String(body.provider || 'cloudflare-worker-motion'),
      provider_job_id: body.provider_job_id ? String(body.provider_job_id) : null,
      status: 'queued',
      retry_count: 0,
      max_retries: Math.max(0, Math.min(Number(body.max_retries) || 3, 8)),
      idempotency_key: idempotencyKey,
      created_at: now(),
      updated_at: now(),
      error: null,
      output: null,
      input: body.input && typeof body.input === 'object' ? body.input : {}
    };
    await this.save(job);
    return Response.json(job, { status: 202 });
  }
}

export function retryMotionJob(job: MotionJob, error: string, transient: boolean): MotionJob {
  if (job.status === 'succeeded' || job.status === 'cancelled') return job;
  job.error = error;
  if (transient && job.retry_count < job.max_retries) {
    job.retry_count += 1;
    job.status = 'polling';
  } else {
    job.status = 'failed';
  }
  job.updated_at = now();
  return job;
}

export function completeMotionJob(job: MotionJob, output: Record<string, unknown>): MotionJob {
  if (job.status === 'succeeded') return job;
  job.output = output;
  job.error = null;
  job.status = 'succeeded';
  job.updated_at = now();
  return job;
}
