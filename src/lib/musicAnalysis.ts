import type { SongAnalysis } from "../types/song";

function mean(values: Float32Array) {
  let sum = 0;
  for (const value of values) sum += value;
  return values.length ? sum / values.length : 0;
}

function rms(block: Float32Array, start: number, end: number) {
  let sum = 0;
  for (let i = start; i < end; i++) sum += block[i] * block[i];
  return Math.sqrt(sum / Math.max(1, end - start));
}

function hann(n: number, size: number) {
  return 0.5 * (1 - Math.cos((2 * Math.PI * n) / (size - 1)));
}

function fftReal(input: Float32Array) {
  const n = input.length;
  const real = new Float64Array(input);
  const imag = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const r = real[i]; real[i] = real[j]; real[j] = r;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle), wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let ur = 1, ui = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = real[b] * ur - imag[b] * ui;
        const ti = real[b] * ui + imag[b] * ur;
        real[b] = real[a] - tr; imag[b] = imag[a] - ti;
        real[a] += tr; imag[a] += ti;
        const nr = ur * wr - ui * wi; ui = ur * wi + ui * wr; ur = nr;
      }
    }
  }
  return { real, imag };
}

function estimateBpm(samples: Float32Array, sampleRate: number) {
  const targetRate = 11025;
  const step = Math.max(1, Math.round(sampleRate / targetRate));
  const rate = sampleRate / step;
  const down = new Float32Array(Math.ceil(samples.length / step));
  for (let i = 0, j = 0; i < samples.length; i += step, j++) down[j] = samples[i];

  const frame = 1024, hop = 512;
  const envelope: number[] = [];
  let previous = 0;
  for (let i = 0; i + frame < down.length; i += hop) {
    let current = 0;
    for (let j = 0; j < frame; j++) current += Math.abs(down[i + j]);
    current /= frame;
    envelope.push(Math.max(0, current - previous));
    previous = current;
  }

  const minLag = Math.floor((60 / 180) * rate / hop);
  const maxLag = Math.ceil((60 / 60) * rate / hop);
  let bestLag = minLag, best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0, energy = 0;
    for (let i = lag; i < envelope.length; i++) {
      correlation += envelope[i] * envelope[i - lag];
      energy += envelope[i] * envelope[i] + envelope[i - lag] * envelope[i - lag];
    }
    const score = energy ? correlation / Math.sqrt(energy) : 0;
    if (score > best) { best = score; bestLag = lag; }
  }
  let bpm = 60 * rate / (bestLag * hop);
  while (bpm < 70) bpm *= 2;
  while (bpm > 160) bpm /= 2;
  return { bpm: Math.round(bpm * 10) / 10, confidence: Math.max(0, Math.min(1, best)) };
}

const keyNames = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: number[], b: number[]) {
  const am = mean(new Float32Array(a)), bm = mean(new Float32Array(b));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - am, y = b[i] - bm; num += x * y; da += x * x; db += y * y; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

function estimateKey(samples: Float32Array, sampleRate: number) {
  const size = 4096;
  const chroma = new Array(12).fill(0);
  const windows = Math.min(120, Math.max(1, Math.floor(samples.length / (size * 4))));
  for (let w = 0; w < windows; w++) {
    const start = Math.floor((w * (samples.length - size)) / Math.max(1, windows - 1));
    const input = new Float32Array(size);
    for (let i = 0; i < size; i++) input[i] = (samples[start + i] || 0) * hann(i, size);
    const { real, imag } = fftReal(input);
    for (let k = 2; k < size / 2; k++) {
      const frequency = (k * sampleRate) / size;
      if (frequency < 55 || frequency > 2000) continue;
      const magnitude = Math.hypot(real[k], imag[k]);
      const midi = 69 + 12 * Math.log2(frequency / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += magnitude;
    }
  }
  const normalized = chroma.map((x) => x / Math.max(1, windows));
  let best = { key: "C major", score: -Infinity };
  let second = -Infinity;
  for (let tonic = 0; tonic < 12; tonic++) {
    const major = majorProfile.map((_, i) => normalized[(i + tonic) % 12]);
    const minor = minorProfile.map((_, i) => normalized[(i + tonic) % 12]);
    const majorScore = correlation(major, majorProfile);
    const minorScore = correlation(minor, minorProfile);
    for (const [score, mode] of [[majorScore, "major"], [minorScore, "minor"]] as const) {
      if (score > best.score) { second = best.score; best = { key: keyNames[tonic] + " " + mode, score }; }
      else if (score > second) second = score;
    }
  }
  return { key: best.key, confidence: Math.max(0, Math.min(1, (best.score - second + 1) / 2)) };
}

function buildValidatedUrl(baseUrl: string): string {
  try {
    if (baseUrl.includes('/../') || /\/%2e%2e\//i.test(baseUrl)) {
      throw new Error('Invalid path');
    }
    const url = new URL(baseUrl);
    const allowedDomains = ['example.com']; // add your allowed domains here
    if (!allowedDomains.includes(url.hostname)) {
      throw new Error('Invalid host');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Invalid protocol');
    }
    return url.href;
  } catch {
    throw new Error('Invalid URL');
  }
}

export async function analyzeAudioLocally(audioUrl: string): Promise<SongAnalysis> {
  const response = await fetch(buildValidatedUrl(audioUrl));
  if (!response.ok) throw new Error("Could not retrieve the uploaded audio for local analysis.");
  const buffer = await response.arrayBuffer();
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const channel = decoded.getChannelData(0);
    const blockCount = 96;
    const energyCurve: Array<{ time: number; energy: number }> = [];
    let peak = 0, sumSquares = 0, silent = 0;
    for (let i = 0; i < channel.length; i++) { const v = Math.abs(channel[i]); peak = Math.max(peak, v); sumSquares += channel[i] * channel[i]; if (v < 0.015) silent++; }
    for (let b = 0; b < blockCount; b++) {
      const start = Math.floor((b * channel.length) / blockCount);
      const end = Math.floor(((b + 1) * channel.length) / blockCount);
      energyCurve.push({ time: (start / decoded.sampleRate), energy: rms(channel, start, end) });
    }
    const smoothed = energyCurve.map((point, i) => {
      const nearby = energyCurve.slice(Math.max(0, i - 2), Math.min(blockCount, i + 3));
      return { ...point, energy: nearby.reduce((s, p) => s + p.energy, 0) / nearby.length };
    });
    const candidates = smoothed.map((p, i) => ({
      index: i, score: i ? Math.abs(p.energy - smoothed[i - 1].energy) : 0
    })).sort((a, b) => b.score - a.score).filter((x) => x.score > 0);
    const boundaries: number[] = [];
    for (const candidate of candidates) {
      const time = smoothed[candidate.index].time;
      if (boundaries.every((other) => Math.abs(other - time) >= Math.max(6, decoded.duration / 12))) boundaries.push(time);
      if (boundaries.length >= 7) break;
    }
    boundaries.sort((a, b) => a - b);
    const sections = [0, ...boundaries, decoded.duration].filter((v, i, a) => i === 0 || v > a[i - 1] + 0.5)
      .map((start, i, a) => ({ index: i + 1, start_time: start, end_time: a[i + 1] ?? decoded.duration }));
    const bpm = estimateBpm(channel, decoded.sampleRate);
    const key = estimateKey(channel, decoded.sampleRate);
    return {
      duration_seconds: decoded.duration,
      sample_rate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      peak,
      rms: Math.sqrt(sumSquares / channel.length),
      silence_ratio: silent / channel.length,
      energy_curve: smoothed,
      energy_region_candidates: boundaries.map((start, i) => ({ start_time: start, end_time: boundaries[i + 1] ?? decoded.duration, mean_energy: 0, change_score: 0 })),
      bpm: bpm.bpm,
      bpm_confidence: bpm.confidence,
      key: key.key,
      key_confidence: key.confidence,
      time_signature: null,
      time_signature_confidence: null,
      sections,
      genre_tags: [],
      mood_tags: [],
      mood_scores: null,
      movement_tags: [],
      valence_arousal: null,
      instruments: [],
      vocal_presence: null,
      vocal_tags: [],
      description: null,
      provider: "beatvision-local-dsp",
      provider_models: ["onset-energy", "autocorrelation-tempo", "hpcp-lite-key-profile"],
      analysis_method: "browser_audio_decode",
      structure_method: "energy_change_heuristic"
    };
  } finally {
    await context.close();
  }
}
