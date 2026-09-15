export type ProviderStatus = 'available' | 'unavailable' | 'failed';
export type ProviderResult<T> = { status: ProviderStatus; provider: string; data?: T; error?: string; jobId?: string };

export const PRIMARY_CREATIVE_PROVIDER = 'beatvision-arena' as const;
export const PRIMARY_CREATIVE_PROVIDER_LABEL = 'BeatVision Arena · Pixazo + Shotstack';

// Legacy integrations remain available for explicit future/provider configuration.
// They are not selected by the primary BeatVision path.
export const OPTIONAL_PROVIDER_NAMES = [
  'Custom Image API', 'Local Image API', 'Kling', 'legacy Cloudflare AI',
] as const;

export function unavailableProvider<T>(provider: string, reason: string): ProviderResult<T> { return { status:'unavailable', provider, error:reason }; }
export function failedProvider<T>(provider: string, reason: string): ProviderResult<T> { return { status:'failed', provider, error:reason }; }
