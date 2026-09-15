import { ARENA_PROVIDER_NAME } from './arena';

export type ProviderStatus = 'available' | 'unavailable' | 'failed';

export type ProviderResult<T> = {
  status: ProviderStatus;
  provider: string;
  data?: T;
  error?: string;
  jobId?: string;
};

export type BeatVisionProjectInput = {
  projectId: string;
  title: string;
  artist?: string | null;
  lyrics?: string | null;
  audioUrl?: string | null;
  songDuration?: number | null;
  style?: string | null;
  notes?: string | null;
};

export interface LanguageProvider {
  generateWorldReport(input: BeatVisionProjectInput): Promise<ProviderResult<unknown>>;
  generateWorldAssets(input: BeatVisionProjectInput & { worldReport: unknown }): Promise<ProviderResult<unknown>>;
  generateStoryboard(input: BeatVisionProjectInput & { world: unknown }): Promise<ProviderResult<unknown>>;
  generateScenePrompts(input: BeatVisionProjectInput & { world: unknown; storyboard: unknown }): Promise<ProviderResult<unknown>>;
}

export interface ImageProvider {
  generateSceneImage(input: {
    projectId: string;
    sceneId: string;
    prompt: string;
    negativePrompt?: string | null;
    references?: string[];
  }): Promise<ProviderResult<{ sourceUrl: string; providerAssetId?: string }>>;
}

export interface VideoProvider {
  animateScene(input: {
    projectId: string;
    sceneId: string;
    imageUrl: string;
    durationSeconds: number;
    audioContext?: unknown;
  }): Promise<ProviderResult<{ sourceUrl: string; providerAssetId?: string; durationSeconds: number }>>;
}

export interface StorageProvider {
  putAsset(input: {
    projectId: string;
    kind: 'audio' | 'image' | 'video' | 'thumbnail';
    source: Blob | ArrayBuffer | string;
    pathHint: string;
  }): Promise<ProviderResult<{ url: string; storagePath: string }>>;
}

export interface JobProvider {
  enqueue(input: {
    projectId: string;
    type: 'world' | 'storyboard' | 'image' | 'motion' | 'render';
    payload: Record<string, unknown>;
  }): Promise<ProviderResult<{ jobId: string }>>;
}

export type PrimaryCreativeProvider = 'beatvision-arena';

export const PRIMARY_CREATIVE_PROVIDER: PrimaryCreativeProvider = 'beatvision-arena';
export const PRIMARY_CREATIVE_PROVIDER_LABEL = ARENA_PROVIDER_NAME;

// Other provider implementations remain in the repository as optional integration seams.
// They are not selected by the default production path.
export const OPTIONAL_PROVIDER_NAMES = [
  'custom-image-provider',
  'local-image-provider',
  'kling',
  'legacy-cloudflare-ai',
] as const;

export function unavailableProvider<T>(provider: string, reason: string): ProviderResult<T> {
  return { status: 'unavailable', provider, error: reason };
}

export function failedProvider<T>(provider: string, reason: string): ProviderResult<T> {
  return { status: 'failed', provider, error: reason };
}
