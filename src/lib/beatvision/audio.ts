const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']);
const ACCEPTED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
]);

export const AUDIO_STORAGE_LIMIT_BYTES = MAX_AUDIO_BYTES;

function extensionOf(name: string): string {
  const parts = String(name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

export function validateAudioFile(file: File | null | undefined): { ok: true } | { ok: false; error: string } {
  if (!file) return { ok: false, error: 'No audio file selected.' };
  if (!file.size) return { ok: false, error: 'The selected audio file is empty.' };
  if (file.size > MAX_AUDIO_BYTES) return { ok: false, error: 'Audio files must be 25 MB or smaller.' };

  const extension = extensionOf(file.name);
  const mime = String(file.type || '').toLowerCase();
  if (!ACCEPTED_EXTENSIONS.has(extension) && !ACCEPTED_MIME_TYPES.has(mime)) {
    return { ok: false, error: 'Unsupported audio format. Use MP3, WAV, M4A, AAC, OGG, or FLAC.' };
  }

  return { ok: true };
}
