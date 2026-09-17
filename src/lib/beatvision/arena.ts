import { supabase } from '@/db/supabase';

export const ARENA_CONTRACT_VERSION = '1.1';
export const ARENA_PROVIDER_NAME = 'BeatVision Arena · Pixazo + Shotstack';

function id() { return crypto.randomUUID(); }

export async function arenaRequest(operation: string, payload: Record<string, unknown> = {}, path = '/', jobId?: string) {
  const requestId = id();
  const { data, error } = await supabase.functions.invoke('beatvision-arena', {
    body: { contract_version: ARENA_CONTRACT_VERSION, operation, payload, path, request_id: requestId, job_id: jobId },
    headers: { 'X-BeatVision-Request': requestId },
  });
  if (error) {
    const detail = await error?.context?.text?.().catch(() => '');
    throw new Error(detail || error.message || `Arena ${operation} failed.`);
  }
  if (!data) throw new Error(`Arena ${operation} returned no response.`);
  if (data.ok === false) throw new Error(data.error || `Arena ${operation} failed.`);
  return data;
}

export const arenaSceneImage = (payload: Record<string, unknown>) => arenaRequest('sceneImages', payload, '/v1/image/scenes');

export const arenaAnimate = (payload: Record<string, unknown>) => {
  const jobId = id();
  return arenaRequest('animationJob', payload, `/v1/video/animate/jobs/${encodeURIComponent(jobId)}`, jobId);
};

export const arenaAssemble = (payload: Record<string, unknown>) => arenaRequest('assemble', payload, '/v1/video/assemble');
export const arenaAnimationJob = (jobId: string) => arenaRequest('animationJob', {}, `/v1/video/animate/jobs/${encodeURIComponent(jobId)}`, jobId);
export const arenaCapabilities = () => arenaRequest('capabilities', {}, '/v1/capabilities');
