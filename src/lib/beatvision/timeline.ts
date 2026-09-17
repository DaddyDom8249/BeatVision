export interface TimelineRange { startTime: number; endTime: number; duration: number; }

function parseTimeToken(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  const parts = raw.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function parseTimestampRange(value: string | null | undefined): TimelineRange | null {
  if (!value) return null;
  const match = value.trim().match(/^(.+?)\s*(?:-|–|—|to)\s*(.+)$/i);
  if (!match) return null;
  const startTime = parseTimeToken(match[1]);
  const endTime = parseTimeToken(match[2]);
  if (startTime === null || endTime === null || endTime <= startTime) return null;
  return { startTime, endTime, duration: endTime - startTime };
}

export function sceneTimeline(scene: { timestamp_range?: string | null; scene_number: number }, fallbackDuration = 5) {
  const parsed = parseTimestampRange(scene.timestamp_range);
  if (parsed) return parsed;
  const startTime = Math.max(0, (scene.scene_number - 1) * fallbackDuration);
  return { startTime, endTime: startTime + fallbackDuration, duration: fallbackDuration };
}
