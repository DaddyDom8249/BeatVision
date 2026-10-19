// Server-only Modal LTX 0.9.5 adapter. Nothing is submitted on import.
// Modal is opt-in and fails closed if the workspace has not been provisioned.
export const MODAL_MOTION = Object.freeze({
  app: "bragoraforge-modal-motion-proof",
  function: "single_motion_proof",
  provider: "modal",
  model: "Lightricks/LTX-Video-0.9.5",
  revision: "e58e28c39631af4d1468ee57a853764e11c1d37e",
  frames: 49,
  fps: 24,
  maxBytes: 8 * 1024 * 1024,
});
const ACK = "I_AUTHORIZE_ONE_MODAL_GPU_PROOF_WITHIN_MY_CONFIRMED_BUDGET";
type EnvReader = (key: string) => string;
const readEnv: EnvReader = (key) => String(Deno.env.get(key) || "").trim();
export class ModalMotionError extends Error {
  constructor(public code: string) { super(code); }
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
export async function submitModalMotion(
  payload: Record<string, unknown>, source: Uint8Array, env: EnvReader = readEnv,
  sdk?: any,
): Promise<{status: string; job_id: string; provider: string; model: string; source_sha256: string}> {
  assertModalSubmissionEnabled(env);
  checkedBytes(source);
  for (const id of ["project_id","scene_id","source_image_id","generation_job_id"])
    if (!uuid(payload[id])) throw new ModalMotionError("MODAL_REQUEST_ID_INVALID");
  if (payload.image_sha256 !== await sha256Hex(source))
    throw new ModalMotionError("MODAL_IMAGE_DIGEST_INVALID");
  if (typeof payload.prompt !== "string" || payload.prompt.trim().length < 8 || payload.prompt.length > 1600)
    throw new ModalMotionError("MODAL_PROMPT_INVALID");
  if (!Number.isInteger(payload.seed) || Number(payload.seed) < 1 || Number(payload.seed) > 2147483646)
    throw new ModalMotionError("MODAL_SEED_INVALID");
  const { ModalClient } = sdk ?? await import("npm:modal@0.11.1");
  const client = new ModalClient({ tokenId: env("MODAL_TOKEN_ID"), tokenSecret: env("MODAL_TOKEN_SECRET"), maxRetries: 0 });
  try {
    const worker = await client.functions.fromName(MODAL_MOTION.app, MODAL_MOTION.function);
    // .spawn makes exactly one provider submission; a lost receipt must not be retried.
    const call = await worker.spawn([payload, source, ACK]);
    if (!/^fc-[a-zA-Z0-9_-]+$/.test(String(call.functionCallId || "")))
      throw new ModalMotionError("MODAL_JOB_RECEIPT_INVALID");
    return { status: "processing", job_id: call.functionCallId,
      provider: MODAL_MOTION.provider, model: MODAL_MOTION.model,
      source_sha256: String(payload.image_sha256) };
  } finally {
    client.close();
  }
}
export async function pollModalMotion(
  callId: string, env: EnvReader = readEnv, sdk?: any,
): Promise<{status: "processing"} | {status: "completed"; video: Uint8Array; manifest: Record<string, unknown>}> {
  assertModalPollEnabled(env);
  if (!/^fc-[a-zA-Z0-9_-]+$/.test(callId)) throw new ModalMotionError("MODAL_JOB_ID_INVALID");
  const { ModalClient } = sdk ?? await import("npm:modal@0.11.1");
  const client = new ModalClient({ tokenId: env("MODAL_TOKEN_ID"), tokenSecret: env("MODAL_TOKEN_SECRET"), maxRetries: 0 });
  try {
    const call = await client.functionCalls.fromId(callId);
    let data: any;
    try { data = await call.get({ timeoutMs: 750 }); }
    catch (err) {
      if (err && typeof err === "object" && (err as Error).name === "TimeoutError")
        return { status: "processing" };
      throw err;
    }
    const video = checkedBytes(data?.video);
    if (!data?.manifest || typeof data.manifest !== "object")
      throw new ModalMotionError("MODAL_MANIFEST_MISSING");
    return { status: "completed", video, manifest: data.manifest };
  } finally {
    client.close();
  }
}
