type BeatLike = Record<string, unknown>;

const number = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const string = (value: unknown) => String(value ?? '').trim();

function tokens(value: string): Set<string> {
  return new Set(
    value.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

function fingerprint(beat: BeatLike): string {
  return [
    beat.lyricMeaning,
    beat.narrativePurpose,
    beat.emotionalState,
    beat.characterState,
    beat.environment,
    beat.action,
    beat.visualConcept,
    beat.visual_direction,
    beat.location,
  ].map(string).join(' ');
}

export function findSemanticReuse(beats: BeatLike[], threshold = 0.78) {
  const fingerprints = beats.map((beat) => tokens(fingerprint(beat)));
  const duplicates: Array<{ index: number; duplicateOf: number; similarity: number; intentional: boolean }> = [];

  for (let index = 0; index < beats.length; index += 1) {
    for (let previous = 0; previous < index; previous += 1) {
      const score = similarity(fingerprints[index], fingerprints[previous]);
      if (score >= threshold) {
        const reusePolicy = string(beats[index]?.reusePolicy || beats[index]?.reuse_policy);
        const intentional = /intentional_motif_return|approved_reuse|explicit_reuse/i.test(reusePolicy);
        duplicates.push({ index, duplicateOf: previous, similarity: Number(score.toFixed(3)), intentional });
        break;
      }
    }
  }

  return duplicates;
}

export function visualCoverage(beats: BeatLike[], songDuration: number) {
  const duration = Math.max(0, number(songDuration));
  const intervals = beats
    .map((beat) => ({
      start: Math.max(0, number(beat.startTime ?? beat.start_time)),
      end: Math.max(0, number(beat.endTime ?? beat.end_time)),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);

  let covered = 0;
  let cursor = 0;
  const gaps: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    if (interval.start > cursor + 0.02) gaps.push({ start: cursor, end: interval.start });
    if (interval.end > cursor) {
      covered += interval.end - Math.max(cursor, interval.start);
      cursor = interval.end;
    }
  }
  if (duration > cursor + 0.02) gaps.push({ start: cursor, end: duration });

  return {
    duration,
    covered: Math.min(duration || covered, covered),
    ratio: duration > 0 ? Math.min(1, covered / duration) : 1,
    gaps,
    complete: duration === 0 || (gaps.length === 0 && covered >= duration - 0.35),
  };
}

export function guardVisualBeats(beats: BeatLike[], songDuration: number) {
  const coverage = visualCoverage(beats, songDuration);
  const semanticReuse = findSemanticReuse(beats);
  const errors: string[] = [];

  if (!beats.length) errors.push('No visual beats exist.');
  if (!coverage.complete) errors.push(`Timeline coverage is incomplete: ${(coverage.ratio * 100).toFixed(1)}%.`);
  if (coverage.gaps.length) errors.push(`Uncovered intervals: ${coverage.gaps.map((gap) => `${gap.start.toFixed(2)}-${gap.end.toFixed(2)}s`).join(', ')}.`);
  const unexplained = semanticReuse.filter((item) => !item.intentional);
  if (unexplained.length) errors.push(`Unexplained semantic reuse detected in ${unexplained.length} beat(s).`);

  return { ok: errors.length === 0, errors, coverage, semanticReuse };
}
