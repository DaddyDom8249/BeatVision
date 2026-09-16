import { supabase } from '@/db/supabase';

export type WorkerMotionJob = {
  job_id: string;
  project_id: string;
  status: 'queued'|'running'|'polling'|'succeeded'|'failed'|'cancelled';
  provider: string;
  provider_job_id: string | null;
  retry_count: number;
  error: string | null;
  output: Record<string, unknown> | null;
  input: Record<string, unknown>;
};

const baseUrl = () => (import.meta.env.VITE_BEATVISION_WORKER_URL || '').trim().replace(/\/$/, '');

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string,string> = { 'Content-Type': 'application/json' };
  if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  return headers;
}

export function isBeatVisionWorkerConfigured() { return Boolean(baseUrl()); }

export async function workerHealth() {
  const base = baseUrl();
  if (!base) throw new Error('VITE_BEATVISION_WORKER_URL is not configured.');
  const res = await fetch(`${base}/health`);
  if (!res.ok) throw new Error(`BeatVision Worker health check failed: ${res.status}`);
  return res.json();
}

export async function generateWorkerImage(input: Record<string, unknown>): Promise<Blob> {
  const base = baseUrl();
  if (!base) throw new Error('VITE_BEATVISION_WORKER_URL is not configured.');
  const headers = await authHeaders();
  const res = await fetch(`${base}/generate-image`, { method: 'POST', headers, body: JSON.stringify(input) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BeatVision Worker image generation failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return res.blob();
}

export async function createWorkerMotionJob(args: {
  projectId: string;
  jobId: string;
  idempotencyKey: string;
  scene: Record<string, unknown>;
  imageUrl: string;
  prompt: string;
  durationSeconds?: number;
}): Promise<WorkerMotionJob> {
  const base = baseUrl();
  if (!base) throw new Error('VITE_BEATVISION_WORKER_URL is not configured.');
  const headers = await authHeaders();
  const duration = Math.max(1, Math.min(20, Math.round(args.durationSeconds || 4)));
  const res = await fetch(`${base}/v1/motion/jobs/${encodeURIComponent(args.jobId)}`, {
    method: 'POST', headers,
    body: JSON.stringify({
      project_id: args.projectId,
      job_id: args.jobId,
      idempotency_key: args.idempotencyKey,
      provider: 'pixazo-ltx-2-5-lite',
      input: {
        prompt: args.prompt,
        image_url: args.imageUrl,
        duration,
        resolution: '720p'
      }
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`BeatVision Worker motion submission failed (${res.status}): ${data?.error || 'unknown error'}`);
  return data as WorkerMotionJob;
}

export async function getWorkerMotionJob(jobId: string): Promise<WorkerMotionJob> {
  const base = baseUrl();
  if (!base) throw new Error('VITE_BEATVISION_WORKER_URL is not configured.');
  const res = await fetch(`${base}/v1/motion/jobs/${encodeURIComponent(jobId)}`, { headers: await authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(`BeatVision Worker motion status failed (${res.status}): ${data?.error || 'unknown error'}`);
  return data as WorkerMotionJob;
}
