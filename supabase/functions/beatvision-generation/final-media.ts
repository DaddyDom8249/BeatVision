import { validateMp4 } from './hf-motion.ts';

// Explicitly configured output hosts only; never fetch arbitrary provider URLs.
// This is media verification, not approval of a provider's cost or eligibility.
export async function verifyFinalMedia(url: string, expected: unknown, request: typeof fetch = fetch) {
  const fail = (code: string): never => { throw new Error(code); };
  const planned = Number(expected);
  if (!Number.isFinite(planned) || planned <= 0) fail('FINAL_VIDEO_PLAN_DURATION_MISSING');
  const parsed = new URL(url);
  const hosts = (Deno.env.get('FINAL_VIDEO_ALLOWED_HOSTS') || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !hosts.includes(parsed.hostname.toLowerCase())) fail('FINAL_VIDEO_HOST_NOT_ALLOWED');
  const response = await request(parsed.href, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) fail('FINAL_VIDEO_DOWNLOAD_FAILED');
  const limit = 50 * 1024 * 1024;
  if (Number(response.headers.get('content-length') || 0) > limit) fail('FINAL_VIDEO_TOO_LARGE');
  const reader = response.body?.getReader();
  if (!reader) fail('FINAL_VIDEO_EMPTY');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const item = await reader!.read(); if (item.done) break;
      size += item.value.length; if (size > limit) fail('FINAL_VIDEO_TOO_LARGE');
      chunks.push(item.value);
    }
  } finally { await reader!.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const media = validateMp4(bytes);
  if (!(media.audio_duration_seconds > 0) || media.audio_samples < 1) fail('FINAL_VIDEO_AUDIO_MISSING');
  // Half a second permits codec padding/rounding, never planned-duration fallback.
  if (Math.abs(media.video_duration_seconds - planned) > 0.5 || Math.abs(media.audio_duration_seconds - planned) > 0.5) fail('FINAL_VIDEO_DURATION_MISMATCH');
  return media;
}
