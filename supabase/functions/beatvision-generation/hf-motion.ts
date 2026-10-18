// Reviewed 2026-10-13: public ZeroGPU API, owner confirmed LTX license eligibility.
// No Inference Providers, paid hardware, credits, or alternative hosts are used.
export const HF_MOTION = Object.freeze({
  space: 'Lightricks/ltx-video-distilled',
  revision: '8a42e93469c66b62d794b83a4233f5fc8439e2b5',
  host: 'https://lightricks-ltx-video-distilled.hf.space',
  endpoint: 'image_to_video', model: 'ltxv-13b-0.9.8-distilled',
  license: 'https://huggingface.co/Lightricks/LTX-Video/blob/main/LTX-Video-Open-Weights-License-0.X.txt',
  account: 'DaddyDom8249', duration: 2,
});
const EXPECTED_PARAMS = ['prompt','negative_prompt','input_image_filepath','input_video_filepath','height_ui','width_ui','mode','duration_ui','ui_frames_to_use','seed_ui','randomize_seed','ui_guidance_scale','improve_texture_flag'];
export class HfMotionError extends Error {
  code: string; retryable: boolean;
  constructor(code: string, retryable = false) { super(code); this.code = code; this.retryable = retryable; }
}
const fail = (code: string, retryable = false): never => { throw new HfMotionError(code, retryable); };
function headers(token: string) { return { Authorization: 'Bearer ' + token }; }
async function readJson(url: string, token: string, request: typeof fetch) {
  const response = await request(url, { headers: headers(token), signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) fail(response.status === 401 || response.status === 403 ? 'HF_AUTH_UNAVAILABLE' : 'HF_METADATA_UNAVAILABLE', response.status === 429 || response.status >= 500);
  return await response.json();
}
export async function hfEligibility(token: string, request: typeof fetch = fetch) {
  if (!token) fail('HF_VIDEO_TOKEN_MISSING');
  const identity = await readJson('https://huggingface.co/api/whoami-v2', token, request);
  // PRO/organizations can spend prepaid credits. This adapter permits ONLY the
  // verified personal free account; never trust a client-supplied cost_class.
  if (identity.type !== 'user' || identity.name !== HF_MOTION.account || identity.isPro !== false) fail('HF_FREE_ACCOUNT_NOT_VERIFIED');
  const runtime = await readJson('https://huggingface.co/api/spaces/' + HF_MOTION.space, token, request);
  if (runtime.sha !== HF_MOTION.revision || runtime.runtime?.stage !== 'RUNNING' || runtime.runtime?.hardware?.current !== 'zero-a10g' || runtime.host !== HF_MOTION.host) fail('HF_SPACE_ELIGIBILITY_CHANGED');
  const info = await readJson(HF_MOTION.host + '/gradio_api/info', token, request);
  const endpoint = info.named_endpoints?.['/' + HF_MOTION.endpoint];
  if (JSON.stringify(endpoint?.parameters?.map((p: any) => p.parameter_name)) !== JSON.stringify(EXPECTED_PARAMS) || endpoint?.returns?.[0]?.component !== 'Video' || endpoint?.show_api === false) fail('HF_API_CONTRACT_CHANGED');
  return { cost_class: 'free', account: identity.name, space: HF_MOTION.space, revision: runtime.sha, checked_at: new Date().toISOString(), quota_policy: 'free personal account; 300 GPU seconds/day; xlarge consumes 2x; exhaustion fails without payment', license: HF_MOTION.license };
}
/**
 * Pin variation to the immutable generation job ID. A new queued variant gets
 * a new seed; retries of the SAME job retain the same seed without re-randomizing.
 * No provider requests or mutable database state are involved in this mapping.
 */
export function hfJobSeed(jobId: string): number {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId))
    fail('HF_JOB_ID_INVALID');
  return (parseInt(jobId.slice(0, 8), 16) % 2147483646) + 1;
}
export function hfInput(imageUrl: string, prompt: string, seed: number) {
  if (!/^https:\/\//.test(imageUrl) || !prompt.trim() || prompt.length > 6000) fail('HF_INPUT_INVALID');
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 2147483646) fail('HF_SEED_INVALID');
  return [prompt, 'worst quality, inconsistent motion, blurry, jittery, distorted, static image, camera pan, camera zoom',
    { path: imageUrl, url: imageUrl, meta: { _type: 'gradio.FileData' } }, null, 512, 704, 'image-to-video', HF_MOTION.duration, 9, seed, false, 1, true];
}
export async function hfSubmit(token: string, imageUrl: string, prompt: string, seed: number, request: typeof fetch = fetch) {
  const input = hfInput(imageUrl, prompt, seed); // reject an invalid/missing seed before any request
  const eligibility = await hfEligibility(token, request);
  // NEVER retry POST: a timeout can mean accepted work. Controller records an
  // ambiguous dispatch rather than creating another GPU request.
  let response: Response;
  try { response = await request(HF_MOTION.host + '/gradio_api/call/' + HF_MOTION.endpoint, { method: 'POST', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ data: input }), signal: AbortSignal.timeout(20000), redirect: 'error' }); }
  catch { return fail('HF_SUBMISSION_ACCEPTANCE_UNKNOWN'); }
  if (!response.ok) fail(response.status === 429 ? 'HF_QUOTA_EXHAUSTED' : 'HF_SUBMIT_REJECTED');
  const data = await response.json();
  if (!/^[a-f0-9]{32}$/.test(data.event_id || '')) fail('HF_EVENT_ID_MISSING');
  return { ok: true, status: 'processing', provider: 'huggingface-zerogpu', model: HF_MOTION.model, job_id: data.event_id, eligibility,
    result: { generation_type: 'GENERATIVE_VIDEO', duration_seconds: HF_MOTION.duration, requested_seed: seed } };
}
export function hfEvent(block: string) {
  const event = block.match(/^event:\s*(\S+)/m)?.[1];
  const raw = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
  if (event === 'error') {
    // Map only known failure categories. Never expose provider-internal SSE text
    // (which may contain source URLs or user-derived prompts) in persisted jobs.
    const detail = raw.slice(0, 4096);
    if (/(?:quota|gpu[\\s_-]*seconds?.*(?:limit|exceed|used)|daily[\\s_-]*(?:limit|allowance)|zerogpu.*(?:exceed|quota)|too many gpu seconds)/i.test(detail))
      fail('HF_QUOTA_EXHAUSTED');
    if (/(?:CUDA.*out of memory|out of memory|GPU.*(?:unavailable|busy)|queue.*(?:full|capacity)|no gpu available)/i.test(detail))
      fail('HF_CAPACITY_UNAVAILABLE');
    fail('HF_GENERATION_FAILED');
  }
  if (event !== 'complete') return null;
  let data: any; try { data = JSON.parse(raw); } catch { return fail('HF_OUTPUT_INVALID'); }
  const url = data?.[0]?.video?.url;
  let parsed: URL; try { parsed = new URL(url); } catch { return fail('HF_OUTPUT_MISSING'); }
  if (parsed.origin !== HF_MOTION.host || !parsed.pathname.startsWith('/gradio_api/file=')) fail('HF_OUTPUT_HOST_REJECTED');
  return { ok: true, status: 'completed', provider: 'huggingface-zerogpu', model: HF_MOTION.model,
    result: { video_url: parsed.href, seed: data[1], generation_type: 'GENERATIVE_VIDEO', duration_seconds: HF_MOTION.duration } };
}
export async function hfPoll(token: string, eventId: string, request: typeof fetch = fetch) {
  if (!token || !/^[a-f0-9]{32}$/.test(eventId)) fail('HF_POLL_INPUT_INVALID');
  const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 20000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await request(HF_MOTION.host + '/gradio_api/call/' + HF_MOTION.endpoint + '/' + eventId, { headers: headers(token), signal: abort.signal, redirect: 'error' });
    if (!response.ok) fail(response.status === 429 ? 'HF_QUOTA_EXHAUSTED' : 'HF_POLL_UNAVAILABLE', response.status >= 500);
    reader = response.body?.getReader(); if (!reader) fail('HF_POLL_EMPTY');
    let buffer = ''; const decoder = new TextDecoder();
    while (true) {
      const item = await reader!.read(); if (item.done) break;
      buffer += decoder.decode(item.value, { stream: true }).replace(/\r\n/g, '\n');
      if (buffer.length > 65536) fail('HF_EVENT_TOO_LARGE');
      let split: number;
      while ((split = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, split); buffer = buffer.slice(split + 2);
        const result = hfEvent(block); if (result) return result;
      }
    }
    const result = hfEvent(buffer); if (result) return result;
  } catch (error) {
    if (!(abort.signal.aborted)) throw error;
  } finally { clearTimeout(timer); await reader?.cancel().catch(() => {}); }
  return { ok: true, status: 'processing', provider: 'huggingface-zerogpu', model: HF_MOTION.model };
}
// Container validation is not evidence of subject motion. The one-shot release
// test must additionally decode frames, inspect character motion and play MP4.
export function validateMp4(bytes: Uint8Array) {
  if (bytes.length < 1024) fail('HF_VIDEO_EMPTY_OR_TRUNCATED');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (i: number) => String.fromCharCode(...bytes.slice(i, i + 4));
  const boxes = (start: number, end: number) => {
    const out: Array<{ type: string; start: number; end: number }> = [];
    for (let i = start; i < end;) {
      if (i + 8 > end) fail('HF_MP4_INVALID');
      const length = view.getUint32(i); if (length < 8 || i + length > end) fail('HF_MP4_INVALID');
      out.push({ type: text(i + 4), start: i + 8, end: i + length }); i += length;
    } return out;
  };
  const top = boxes(0, bytes.length);
  if (!top.some(b => b.type === 'ftyp') || !top.some(b => b.type === 'mdat' && b.end - b.start > 100)) fail('HF_MP4_MEDIA_MISSING');
  const moov = top.find(b => b.type === 'moov'); if (!moov) fail('HF_MP4_METADATA_MISSING');
  let samples = 0;
  let videoDuration = 0;
  let audioDuration = 0;
  let audioSamples = 0;
  for (const track of boxes(moov!.start, moov!.end).filter(b => b.type === 'trak')) {
    const mdia = boxes(track.start, track.end).find(b => b.type === 'mdia'); if (!mdia) continue;
    const children = boxes(mdia.start, mdia.end); const handler = children.find(b => b.type === 'hdlr');
    if (!handler || handler.start + 12 > handler.end) continue;
    const kind = text(handler.start + 8);
    const timing = children.find(b => b.type === 'mdhd');
    let seconds = 0;
    if (timing && timing.start + 20 <= timing.end && bytes[timing.start] === 0) {
      const scale = view.getUint32(timing.start + 12);
      seconds = scale ? view.getUint32(timing.start + 16) / scale : 0;
    }
    if (kind === 'soun') {
      const minf = children.find(b => b.type === 'minf');
      const stbl = minf && boxes(minf.start, minf.end).find(b => b.type === 'stbl');
      const stsz = stbl && boxes(stbl.start, stbl.end).find(b => b.type === 'stsz');
      if (stsz && stsz.start + 12 <= stsz.end) audioSamples = Math.max(audioSamples, view.getUint32(stsz.start + 8));
      audioDuration = Math.max(audioDuration, seconds); continue;
    }
    if (kind !== 'vide') continue;
    videoDuration = Math.max(videoDuration, seconds);
    const minf = children.find(b => b.type === 'minf'); if (!minf) continue;
    const stbl = boxes(minf.start, minf.end).find(b => b.type === 'stbl'); if (!stbl) continue;
    const tables = boxes(stbl.start, stbl.end);
    const stsd = tables.find(b => b.type === 'stsd');
    const mdhd = children.find(b => b.type === 'mdhd');
    if (!stsd || stsd.start + 16 > stsd.end || text(stsd.start + 12) !== 'avc1') fail('HF_MP4_CODEC_UNSUPPORTED');
    if (!mdhd || mdhd.start + 20 > mdhd.end || bytes[mdhd.start] !== 0 || view.getUint32(mdhd.start + 12) === 0 || view.getUint32(mdhd.start + 16) === 0) fail('HF_MP4_DURATION_MISSING');
    const stsz = tables.find(b => b.type === 'stsz');
    if (stsz && stsz.start + 12 <= stsz.end) samples = view.getUint32(stsz.start + 8);
  }
  if (samples < 2) fail('HF_MP4_VIDEO_SAMPLES_MISSING');
  return { byte_length: bytes.length, video_samples: samples, video_duration_seconds: videoDuration, audio_duration_seconds: audioDuration, audio_samples: audioSamples, container_verified: true, subject_motion_verified: false };
}
export async function hfDownload(url: string, token: string, request: typeof fetch = fetch) {
  const parsed = new URL(url);
  if (parsed.origin !== HF_MOTION.host || !parsed.pathname.startsWith('/gradio_api/file=')) fail('HF_OUTPUT_HOST_REJECTED');
  const response = await request(url, { headers: headers(token), redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) fail('HF_VIDEO_DOWNLOAD_FAILED', response.status >= 500);
  if (Number(response.headers.get('content-length') || 0) > 50 * 1024 * 1024) fail('HF_VIDEO_TOO_LARGE');
  const reader = response.body?.getReader(); if (!reader) fail('HF_VIDEO_EMPTY');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const item = await reader!.read(); if (item.done) break; size += item.value.length; if (size > 50 * 1024 * 1024) fail('HF_VIDEO_TOO_LARGE'); chunks.push(item.value); } }
  finally { await reader?.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return { bytes, verification: validateMp4(bytes) };
}
