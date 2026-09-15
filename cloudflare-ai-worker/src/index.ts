interface Env {
  AI: any;
  ALLOWED_ORIGIN?: string;
}

type AnyObj = Record<string, any>;

const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://beat-vision.vercel.app",
  "https://beat-vision-theta.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173"
]);

function getCorsHeaders(request: Request, env: Env) {
  const origin = request.headers.get("Origin") || "";
  const configured = env.ALLOWED_ORIGIN?.trim();
  const allowOrigin = configured && configured !== "*"
    ? configured
    : DEFAULT_ALLOWED_ORIGINS.has(origin) ? origin : "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(data: unknown, status: number, request: Request, env: Env) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(request, env)
    }
  });
}

function safeText(value: any, fallback = "", max = 4000): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value.trim().slice(0, max);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function safeNum(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function linesFrom(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => safeText(item, "", 600))
    .filter(Boolean)
    .slice(0, max);
}

function buildPrompt(payload: AnyObj) {
  const projectId = safeText(payload.project_id, "beatvision-project", 300);
  const projectTitle = safeText(payload.project_title, "Untitled BeatVision project", 300);
  const artist = safeText(payload.artist, "", 300);
  const sceneNumber = Math.max(1, Math.floor(safeNum(payload.scene_number, 1)));
  const variationIndex = Math.max(0, Math.floor(safeNum(payload.variation_index, 0)));
  const sceneTitle = safeText(payload.scene_title, `Scene ${sceneNumber}`, 500);
  const scenePrompt = safeText(payload.prompt, "", 5000);
  const musicalSection = safeText(payload.musical_section || payload.musicalSection, "", 500);
  const visualEvent = safeText(payload.visual_event || payload.visualEvent || payload.description, "", 2500);
  const previousBeat = safeText(payload.previous_beat || payload.previousBeat, "none", 1200);
  const nextBeat = safeText(payload.next_beat || payload.nextBeat, "none", 1200);
  const worldContext = safeText(payload.world_context || payload.worldContext, "", 6000);
  const styleBible = safeText(payload.style_bible || payload.styleBible, "", 5000);
  const references = linesFrom(payload.reference_descriptions || payload.referenceDescriptions, 8);
  const forbidden = linesFrom(payload.forbidden_visuals || payload.forbiddenVisuals, 16);
  const negativePrompt = safeText(payload.negative_prompt, "", 4000);

  const userSeed = safeNum(payload.seed, 0);
  const projectSeed = safeNum(payload.project_seed, hashString(projectId));
  const finalSeed = userSeed > 0 ? userSeed : (projectSeed + sceneNumber * 100 + variationIndex) >>> 0;

  const referenceSection = references.length
    ? `Reference descriptions:\n${references.map((item) => `- ${item}`).join("\n")}`
    : "";
  const forbiddenSection = forbidden.length
    ? `Explicit forbidden visuals:\n${forbidden.map((item) => `- ${item}`).join("\n")}`
    : "";

  const finalPrompt = [
    "BeatVision cinematic music-video still.",
    `Song: ${projectTitle}${artist ? ` by ${artist}` : ""}.`,
    `Scene ${sceneNumber}: ${sceneTitle}.`,
    musicalSection ? `Musical section: ${musicalSection}.` : "",
    visualEvent ? `Visual event: ${visualEvent}.` : "",
    scenePrompt ? `Creator/scene direction: ${scenePrompt}.` : "",
    worldContext ? `Established Visual World:\n${worldContext}` : "",
    styleBible ? `Established Style Bible:\n${styleBible}` : "",
    referenceSection,
    `Previous beat: ${previousBeat}. Next beat: ${nextBeat}.`,
    "Create a new visual event that advances the song while preserving the established world, characters, environments, visual language, and continuity.",
    "Do not silently copy, reorder, recolor, crop, or reframe another scene as a substitute for a new visual event.",
    "Do not invent unrelated characters, locations, props, costumes, logos, text, interfaces, or narrative elements.",
    "If a recurring lyric or motif returns, change the consequence, emotional state, spatial relationship, action, or visual event unless explicit reuse is authorized by the scene data.",
    forbiddenSection
  ].filter(Boolean).join("\n");

  const finalNegativePrompt = [
    negativePrompt,
    "unrelated location",
    "unrelated character",
    "different established character identity",
    "different established costume",
    "random concept art",
    "character model sheet",
    "turnaround sheet",
    "reference sheet",
    "text",
    "watermark",
    "logo",
    "UI elements",
    "low quality",
    "blurry",
    "distorted anatomy",
    "extra limbs",
    "bad hands"
  ].filter(Boolean).join(", ");

  return { finalPrompt, finalNegativePrompt, finalSeed };
}

function base64ToUint8Array(base64: string) {
  const clean = base64.includes(",") ? base64.split(",").pop() || base64 : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function normalizeAiImageResult(result: any): Promise<BodyInit | null> {
  if (!result) return null;
  if (result instanceof Response) return await result.arrayBuffer();
  if (result instanceof ReadableStream) return result;
  if (result instanceof ArrayBuffer) return result;
  if (result instanceof Uint8Array) return result;
  if (typeof result === "string") return base64ToUint8Array(result);

  const possibleBase64 = result.image || result.data || result.result?.image || result.result?.data || result.output?.[0] || null;
  return typeof possibleBase64 === "string" ? base64ToUint8Array(possibleBase64) : null;
}

async function fetchReferenceImageBytes(url: string): Promise<number[] | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "BeatVision-Cloudflare-Worker/1.0" } });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return Array.from(bytes);
  } catch {
    return null;
  }
}

async function runImageModel(env: Env, model: string, input: AnyObj) {
  try {
    return await env.AI.run(model, input);
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    if ("seed" in input && msg.toLowerCase().includes("seed")) {
      const retryInput = { ...input };
      delete retryInput.seed;
      return await env.AI.run(model, retryInput);
    }
    throw err;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
    }

    const url = new URL(request.url);

    if ((url.pathname === "/" || url.pathname === "/health") && request.method === "GET") {
      return jsonResponse({
        ok: true,
        name: "BeatVision Cloudflare AI Worker",
        routes: ["/generate-image"],
        reference_img2img: true,
        prompt_mode: "beatvision_song_world_context",
        hardcoded_test_world: false
      }, 200, request, env);
    }

    if (url.pathname !== "/generate-image") {
      return jsonResponse({ ok: false, error: "Route not found." }, 404, request, env);
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Use POST for image generation." }, 405, request, env);
    }

    let payload: AnyObj;
    try {
      const parsed = await request.json();
      payload = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON body." }, 400, request, env);
    }

    const { finalPrompt, finalNegativePrompt, finalSeed } = buildPrompt(payload);
    const referenceImageUrl = safeText(payload.reference_image_url, "", 2000);
    const referenceImageBytes = referenceImageUrl ? await fetchReferenceImageBytes(referenceImageUrl) : null;
    const requestedModel = safeText(payload.model_name, "", 300);
    const model = requestedModel || (referenceImageBytes
      ? "@cf/runwayml/stable-diffusion-v1-5-img2img"
      : "@cf/stabilityai/stable-diffusion-xl-base-1.0");

    const width = Math.max(256, Math.min(2048, Math.floor(safeNum(payload.width, 1024))));
    const height = Math.max(256, Math.min(2048, Math.floor(safeNum(payload.height, 576))));
    const num_steps = Math.max(1, Math.min(50, Math.floor(safeNum(payload.num_steps, 20))));
    const guidance = Math.max(1, Math.min(20, safeNum(payload.guidance, referenceImageBytes ? 9.5 : 10)));
    const strength = Math.max(0.25, Math.min(0.78, safeNum(payload.strength, 0.52)));

    const input: AnyObj = {
      prompt: finalPrompt,
      negative_prompt: finalNegativePrompt,
      width,
      height,
      num_steps,
      guidance,
      seed: finalSeed
    };

    if (referenceImageBytes) {
      input.image = referenceImageBytes;
      input.strength = strength;
    }

    try {
      const result = await runImageModel(env, model, input);
      const body = await normalizeAiImageResult(result);
      if (!body) {
        return jsonResponse({ ok: false, error: "Workers AI returned no usable image.", provider: "cloudflare_workers_ai" }, 502, request, env);
      }

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
          "X-BeatVision-Provider": "cloudflare_workers_ai",
          "X-BeatVision-Seed": String(finalSeed),
          "X-BeatVision-Reference-Used": String(Boolean(referenceImageBytes)),
          ...getCorsHeaders(request, env)
        }
      });
    } catch (err: any) {
      return jsonResponse({
        ok: false,
        error: "Cloudflare image generation failed.",
        provider: "cloudflare_workers_ai",
        details: String(err?.message || err),
        model,
        reference_image_used: Boolean(referenceImageBytes)
      }, 500, request, env);
    }
  }
};
