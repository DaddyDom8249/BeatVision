import { supabase } from '@/db/supabase';

export const ARENA_CONTRACT_VERSION = '1.1';
export const ARENA_PROVIDER_NAME = 'BeatVision Arena · Pixazo + Shotstack';

function id() {
  return crypto.randomUUID();
}

async function extractInvokeError(error: any, operation: string): Promise<string> {
  let detail = '';
  try {
    const ctx = error?.context;
    let raw = '';
    if (ctx && typeof ctx.text === 'function') {
      raw = await ctx.text();
    } else if (typeof ctx === 'string') {
      raw = ctx;
    } else if (ctx && typeof ctx.json === 'function') {
      const parsed = await ctx.json();
      detail = String(parsed?.error || parsed?.message || parsed?.details || '');
      if (parsed?.request_id) detail += ` [request_id=${String(parsed.request_id)}]`;
      if (parsed?.phase) detail += ` [phase=${String(parsed.phase)}]`;
      if (detail) return detail;
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        detail = String(parsed?.error || parsed?.message || parsed?.details || parsed?.status || raw);
        if (parsed?.request_id) detail += ` [request_id=${String(parsed.request_id)}]`;
        if (parsed?.phase) detail += ` [phase=${String(parsed.phase)}]`;
      } catch {
        detail = raw.slice(0, 1200);
      }
    }
  } catch {
    // Supabase may expose a non-Response context for transport failures.
  }
  const message = String(error?.message || '');
  if (/failed to fetch|network|fetch/i.test(message) && !detail) {
    return `Arena ${operation} could not reach the Edge Function. Check Supabase function deployment/CORS/authentication. ${message}`;
  }
  return detail || message || `Arena ${operation} failed.`;
}

export async function arenaRequest(
  operation: string,
  payload: Record<string, unknown> = {},
  path = '/',
  jobId?: string,
) {
  const requestId = id();
  const { data, error } = await supabase.functions.invoke('beatvision-arena', {
    body: {
      contract_version: ARENA_CONTRACT_VERSION,
      operation,
      payload,
      path,
      request_id: requestId,
      job_id: jobId,
    },
    headers: { 'X-BeatVision-Request': requestId },
  });

  if (error) {
    if (data && typeof data === 'object' && (data as any).ok === false && (data as any).error) {
      const d = data as Record<string, unknown>;
      let msg = String(d.error);
      if (d.request_id) msg += ` [request_id=${String(d.request_id)}]`;
      if (d.phase) msg += ` [phase=${String(d.phase)}]`;
      throw new Error(msg);
    }
    throw new Error(await extractInvokeError(error, operation));
  }

  if (!data) throw new Error(`Arena ${operation} returned no response.`);
  if (data.ok === false) {
    let msg = String(data.error || `Arena ${operation} failed.`);
    if (data.request_id) msg += ` [request_id=${String(data.request_id)}]`;
    if (data.phase) msg += ` [phase=${String(data.phase)}]`;
    throw new Error(msg);
  }
  return data;
}

export const arenaSceneImage = (payload: Record<string, unknown>) =>
  arenaRequest('sceneImages', payload, '/v1/image/scenes');

export const arenaAnimate = (payload: Record<string, unknown>) => {
  const jobId = id();
  return arenaRequest('animationJob', payload, `/v1/video/animate/jobs/${encodeURIComponent(jobId)}`, jobId);
};

export const arenaAssemble = (payload: Record<string, unknown>) =>
  arenaRequest('assemble', payload, '/v1/video/assemble');

export const arenaAssemblyStatus = (renderId: string, projectId: string, targetDurationSeconds: number) =>
  arenaRequest(
    'assembleStatus',
    {
      project_id: projectId,
      target_duration_seconds: targetDurationSeconds,
    },
    `/v1/video/assemble/status/${encodeURIComponent(renderId)}`,
  );

export const arenaAnimationJob = (jobId: string) =>
  arenaRequest('animationJob', {}, `/v1/video/animate/jobs/${encodeURIComponent(jobId)}`, jobId);

export const arenaCapabilities = () => arenaRequest('capabilities', {}, '/v1/capabilities');
