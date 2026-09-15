import { supabase } from '@/db/supabase';

export const ARENA_CONTRACT_VERSION = '1.1';
export const ARENA_PROVIDER_NAME = 'BeatVision Arena · Pixazo + Shotstack';

type ArenaResponse<T = any> = T & {
  ok?: boolean;
  error?: string;
  status?: string;
  request_id?: string;
  contract_version?: string;
};

function requestId(): string {
  return crypto.randomUUID();
}

export async function arenaRequest<T = any>(operation: string, payload: Record<string, unknown> = {}, method: 'POST' | 'GET' = 'POST', path?: string): Promise<ArenaResponse<T>> {
  const body = {
    contract_version: ARENA_CONTRACT_VERSION,
    operation,
    payload,
    path: path || undefined,
    request_id: requestId(),
  };

  const { data, error } = await supabase.functions.invoke('beatvision-arena', {
    method,
    body: method === 'POST' ? body : { path: path || '/', request_id: body.request_id },
    headers: { 'X-BeatVision-Request': body.request_id },
  } as any);

  if (error) {
    const detail = await error?.context?.text?.().catch(() => '');
    throw new Error(detail || error.message || `Arena ${operation} request failed.`);
  }
  if (!data) throw new Error(`Arena ${operation} returned no response.`);
  return data as ArenaResponse<T>;
}

export async function arenaHealth() {
  return arenaRequest('health', {}, 'GET', '/health');
}

export async function arenaCapabilities() {
  return arenaRequest('capabilities', {}, 'GET', '/v1/capabilities');
}

export async function arenaSceneImage(input: {
  projectId: string;
  song: { title: string; artist?: string | null };
  scene: Record<string, unknown>;
  world: Record<string, unknown>;
  style?: string | null;
  references?: string[];
  forbidden?: string[];
}) {
  return arenaRequest('sceneImages', {
    project_id: input.projectId,
    song_title: input.song.title,
    artist: input.song.artist || '',
    style: input.style || '',
    world: input.world,
    storyboard: { scenes: [input.scene] },
    reference_descriptions: input.references || [],
    forbidden_visuals: input.forbidden || [],
  });
}

export async function arenaAnimate(input: {
  projectId: string;
  storyboard: Record<string, unknown>;
  images: Array<Record<string, unknown>>;
  world?: Record<string, unknown>;
}) {
  return arenaRequest('animate', {
    project_id: input.projectId,
    storyboard: input.storyboard,
    images: { images: input.images },
    world: input.world || {},
  });
}

export async function arenaAssemble(input: {
  projectId: string;
  storyboard: Record<string, unknown>;
  motion: Record<string, unknown>;
  audioUrl?: string | null;
  songDuration?: number | null;
  allowCameraMotionFallback?: boolean;
}) {
  return arenaRequest('assemble', {
    project_id: input.projectId,
    storyboard: input.storyboard,
    motion: input.motion,
    audio_url: input.audioUrl || null,
    song_duration_seconds: input.songDuration || null,
    allow_camera_motion_fallback: input.allowCameraMotionFallback === true,
  });
}

export async function arenaAnimationJob(jobId: string) {
  return arenaRequest('animationJob', {}, 'GET', `/v1/video/animate/jobs/${encodeURIComponent(jobId)}`);
}
