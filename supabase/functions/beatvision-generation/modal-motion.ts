// Server-only Modal LTX 0.9.5 adapter. Nothing is submitted on import.
// Modal is opt-in and fails closed if the workspace has not been provisioned.
export const MODAL_MOTION = Object.freeze({
  app: "bragoraforge-modal-motion-proof",
  function: "single_motion_proof",
  apiBase: "https://beatvision--bragoraforge-modal-motion-proof-motion-api.us-east.modal.run",
  provider: "modal",
  model: "Lightricks/LTX-Video-0.9.5",
  revision: "e58e28c39631af4d1468ee57a853764e11c1d37e",
  frames: 49,
  maxFrames: 161,
  fps: 24,
  maxBytes: 8 * 1024 * 1024,
});
const ACK = "I_AUTHORIZE_ONE_MODAL_GPU_PROOF_WITHIN_MY_CONFIRMED_BUDGET";
type EnvReader = (key: string) => string;
type Fetcher = typeof fetch;
// Operator-approved five-second release; explicit 49 restores proof-only mode.
const readEnv: EnvReader = (key) => String(Deno.env.get(key) ||
  (key === "BRAGORA_MODAL_MAX_FRAMES" ? "121" : "")).trim();
export class ModalMotionError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}
// Legacy snapshots omit frames. Reject malformed explicit values instead of coercing.
export function assertModalFrameCount(value: unknown): number {
  const frames = value === undefined ? MODAL_MOTION.frames : value;
  if (typeof frames !== "number" || !Number.isInteger(frames) || frames < MODAL_MOTION.frames ||
      frames > MODAL_MOTION.maxFrames || (frames - 1) % 8 !== 0)
    throw new ModalMotionError("MODAL_FRAME_COUNT_INVALID");
  return frames;
}
function modalFrameLimit(env: EnvReader): number {
  // Increasing this operator cap requires a newly verified duration budget and worker.
  // Missing configuration preserves all current two-second behavior.
  const raw = env("BRAGORA_MODAL_MAX_FRAMES");
  if (!raw) return MODAL_MOTION.frames;
  if (!/^\d+$/.test(raw)) throw new ModalMotionError("MODAL_FRAME_LIMIT_INVALID");
  let cap: number;
  try { cap = assertModalFrameCount(Number(raw)); }
  catch { throw new ModalMotionError("MODAL_FRAME_LIMIT_INVALID"); }
  return cap;
}
export function modalFramesForScene(scene: Record<string, unknown>, env: EnvReader = readEnv): number {
  const cap = modalFrameLimit(env);
  if (cap === MODAL_MOTION.frames) return cap;
  const start = scene.start_time, end = scene.end_time;
  if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) ||
      !Number.isFinite(end) || start < 0 || end <= start)
    throw new ModalMotionError("MODAL_SCENE_DURATION_INVALID");
  const needed = Math.ceil(((end - start) * MODAL_MOTION.fps - 1) / 8) * 8 + 1;
  return Math.min(cap, Math.max(MODAL_MOTION.frames, needed));
}
function requireCredentials(env: EnvReader) {
  if (!env("MODAL_TOKEN_ID") || !env("MODAL_TOKEN_SECRET"))
    throw new ModalMotionError("MODAL_CREDENTIALS_UNAVAILABLE");
}
export function assertModalSubmissionEnabled(env: EnvReader = readEnv) {
  requireCredentials(env);
  // Operator must verify account-level billing and deploy the worker.
  // An env flag alone is not proof against an overage.
  if (env("BRAGORA_MODAL_GPU_ENABLED") !== "true" ||
      env("BRAGORA_MODAL_BUDGET_VERIFIED") !== "true")
    throw new ModalMotionError("MODAL_GPU_NOT_ENABLED");
}
function assertModalPollEnabled(env: EnvReader) {
  // Polling a previously submitted job never allocates another worker.
  requireCredentials(env);
}
function uuid(value: unknown): boolean {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map(x => x.toString(16).padStart(2, "0")).join("");
}
export function checkedBytes(raw: unknown): Uint8Array {
  if (!(raw instanceof Uint8Array) || raw.length < 16 || raw.length > MODAL_MOTION.maxBytes)
    throw new ModalMotionError("MODAL_MEDIA_SIZE_INVALID");
  return raw;
}
function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}
function decodeBase64(value: unknown): Uint8Array {
  if (typeof value !== "string" || !value) throw new ModalMotionError("MODAL_MEDIA_MISSING");
  let binary: string;
  try { binary = atob(value); }
  catch { throw new ModalMotionError("MODAL_MEDIA_BASE64_INVALID"); }
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) output[i] = binary.charCodeAt(i);
  return checkedBytes(output);
}
async function modalFetch(
  path: string, env: EnvReader, requester: Fetcher, init: RequestInit,
): Promise<{response: Response; data: any}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  // An 8 MiB clip expands to about 11 MiB in base64; allow its JSON manifest
  // while bounding both declared and chunked responses before JSON parsing.
  const maxResponseBytes = 16 * 1024 * 1024;
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    response = await requester(MODAL_MOTION.apiBase + path, {
      ...init,
      redirect: "error",
      headers: {
        "Modal-Key": env("MODAL_TOKEN_ID"),
        "Modal-Secret": env("MODAL_TOKEN_SECRET"),
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
    const length = response.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > maxResponseBytes))
      throw new ModalMotionError("MODAL_HTTP_RESPONSE_TOO_LARGE");
    reader = response.body?.getReader();
    let raw = "";
    if (reader) {
      const decoder = new TextDecoder();
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxResponseBytes)
          throw new ModalMotionError("MODAL_HTTP_RESPONSE_TOO_LARGE");
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    }
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; }
    catch { throw new ModalMotionError("MODAL_HTTP_RESPONSE_INVALID"); }
    if (!response.ok && response.status !== 202)
      throw new ModalMotionError("MODAL_HTTP_" + response.status + ":" + String(data?.error || "REQUEST_FAILED"));
    return { response, data };
  } catch (error) {
    if (error instanceof ModalMotionError) throw error;
    const name = error && typeof error === "object" ? String((error as Error).name || "") : "";
    throw new ModalMotionError(controller.signal.aborted || name === "AbortError"
      ? "MODAL_HTTP_TIMEOUT" : "MODAL_HTTP_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
    // Cancel unread bytes after an oversized response or transport failure.
    // Do not wait on an upstream cancellation acknowledgment.
    if (reader) {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    } else if (response?.body && !response.body.locked) {
      void response.body.cancel().catch(() => {});
    }
  }
}
export async function submitModalMotion(
  payload: Record<string, unknown>, source: Uint8Array, env: EnvReader = readEnv,
  requester: Fetcher = fetch,
): Promise<{status: string; job_id: string; provider: string; model: string; source_sha256: string}> {
  assertModalSubmissionEnabled(env);
  const frames = assertModalFrameCount(payload.frames);
  if (frames > modalFrameLimit(env)) throw new ModalMotionError("MODAL_DURATION_NOT_ENABLED");
  checkedBytes(source);
  for (const id of ["project_id","scene_id","source_image_id","generation_job_id"])
    if (!uuid(payload[id])) throw new ModalMotionError("MODAL_REQUEST_ID_INVALID");
  if (payload.image_sha256 !== await sha256Hex(source))
    throw new ModalMotionError("MODAL_IMAGE_DIGEST_INVALID");
  if (typeof payload.prompt !== "string" || payload.prompt.trim().length < 8 || payload.prompt.length > 1600)
    throw new ModalMotionError("MODAL_PROMPT_INVALID");
  if (!Number.isInteger(payload.seed) || Number(payload.seed) < 1 || Number(payload.seed) > 2147483646)
    throw new ModalMotionError("MODAL_SEED_INVALID");
  const { data } = await modalFetch("/submit", env, requester, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, image_base64: encodeBase64(source), ack: ACK }),
  });
  if (!/^fc-[a-zA-Z0-9_-]+$/.test(String(data?.job_id || "")))
    throw new ModalMotionError("MODAL_JOB_RECEIPT_INVALID");
  return { status: "processing", job_id: data.job_id,
    provider: MODAL_MOTION.provider, model: MODAL_MOTION.model,
    source_sha256: String(payload.image_sha256) };
}
export async function pollModalMotion(
  callId: string, env: EnvReader = readEnv, requester: Fetcher = fetch,
): Promise<{status: "processing"} | {status: "completed"; video: Uint8Array; manifest: Record<string, unknown>}> {
  assertModalPollEnabled(env);
  if (!/^fc-[a-zA-Z0-9_-]+$/.test(callId)) throw new ModalMotionError("MODAL_JOB_ID_INVALID");
  const { response, data } = await modalFetch("/poll/" + encodeURIComponent(callId), env, requester, {
    method: "GET",
  });
  if (response.status === 202 || data?.status === "processing") return { status: "processing" };
  const video = decodeBase64(data?.video_base64);
  if (!data?.manifest || typeof data.manifest !== "object")
    throw new ModalMotionError("MODAL_MANIFEST_MISSING");
  return { status: "completed", video, manifest: data.manifest };
}
