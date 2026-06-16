interface Env {
  AI: any;
  ALLOWED_ORIGIN?: string;
}

type AnyObj = Record<string, any>;

const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://beat-vision.vercel.app",
  "https://beat-vision-theta.vercel.app",
  "http://localhost:5173"
]);

function getCorsHeaders(request: Request, env: Env) {
  const origin = request.headers.get("Origin") || "";
  const configured = env.ALLOWED_ORIGIN?.trim();

  let allowOrigin = "*";

  if (configured && configured !== "*") {
    allowOrigin = configured;
  } else if (DEFAULT_ALLOWED_ORIGINS.has(origin)) {
    allowOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
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

function safeText(value: any, fallback = ""): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function safeNum(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeJsonParse(value: any): AnyObj | null {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function compact(lines: Array<string | null | undefined | false>) {
  return lines.filter(Boolean).join("\n");
}

function bulletList(title: string, items: string[]) {
  const filtered = items.map(i => i.trim()).filter(Boolean);
  if (!filtered.length) return "";
  return `${title}\n${filtered.map(i => `- ${i}`).join("\n")}`;
}

function objectToBulletSummary(title: string, obj: AnyObj | null, preferredKeys: string[] = []) {
  if (!obj) return "";

  const used = new Set<string>();
  const lines: string[] = [];

  for (const key of preferredKeys) {
    const raw = obj[key];
    const text = safeText(raw);
    if (text) {
      lines.push(`${key.replace(/_/g, " ")}: ${text}`);
      used.add(key);
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (used.has(key)) continue;

    let text = "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      text = safeText(value);
    }

    if (!text) continue;
    if (text.length > 260) continue;

    lines.push(`${key.replace(/_/g, " ")}: ${text}`);
  }

  return bulletList(title, lines.slice(0, 18));
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function buildPrompt(payload: AnyObj) {
  const rawScenePrompt = safeText(payload.prompt);
  const negativePrompt = safeText(payload.negative_prompt);

  const styleBible = safeJsonParse(payload.style_bible);
  const characterSheet = safeJsonParse(payload.character_sheet);
  const environmentSheet = safeJsonParse(payload.environment_sheet);

  const projectId = safeText(payload.project_id, "beatvision-project");
  const projectTitle = safeText(payload.project_title, "BeatVision music video");
  const sceneNumber = safeNum(payload.scene_number, 0);
  const variationIndex = safeNum(payload.variation_index, 0);
  const sceneTitle = safeText(payload.scene_title, `Scene ${sceneNumber || "Unknown"}`);

  const anchorSummary = safeText(payload.anchor_summary);
  const worldSummary = safeText(payload.world_summary);
  const referenceNotes = safeText(payload.reference_notes);

  const userSeed = safeNum(payload.seed, 0);
  const projectSeed = safeNum(payload.project_seed, hashString(projectId));
  const finalSeed = userSeed > 0 ? userSeed : projectSeed + sceneNumber * 100 + variationIndex;

  const charIdentity =
    safeText(characterSheet?.identity_lock) ||
    safeText(characterSheet?.summary) ||
    safeText(characterSheet?.signature_clothing) ||
    "same female auto salvage-yard worker, neon yellow reflective safety vest, grounded workwear, tattooed forearms when visible";

  const worldIdentity =
    safeText(environmentSheet?.world_identity_lock) ||
    safeText(environmentSheet?.summary) ||
    safeText(environmentSheet?.primary_location) ||
    "rainy Alabama LKQ pick-your-part auto salvage yard, mud, stripped vehicles, wire harnesses, drain rack, metal, floodlights, humid industrial atmosphere";

  const styleIdentity =
    safeText(styleBible?.visual_style) ||
    safeText(styleBible?.summary) ||
    "photoreal cinematic realism, gritty dark music-video frame, wet surfaces, dramatic industrial lighting, grounded documentary texture";

  const actionPrompt = rawScenePrompt || [
    "female salvage-yard worker actively dismantling a vehicle",
    "pulling wire harnesses near a stripped dashboard",
    "mud and rain on work clothes",
    "junk cars and industrial lights in the background"
  ].join(", ");

  const finalPrompt = [
    "Full-color photoreal cinematic music-video still frame.",
    "Real camera look, 16:9 movie frame, gritty realism, no illustration.",
    `Project/song world: ${projectTitle}.`,
    `Scene ${sceneNumber}: ${sceneTitle}.`,
    `Scene action: ${actionPrompt}.`,
    `Protagonist continuity: ${charIdentity}.`,
    `World continuity: ${worldIdentity}.`,
    `Visual style: ${styleIdentity}.`,
    anchorSummary ? `Anchor continuity: ${anchorSummary}.` : "",
    worldSummary ? `World anchor: ${worldSummary}.` : "",
    referenceNotes ? `Additional continuity notes: ${referenceNotes}.` : "",
    "The frame must show the protagonist physically inside the salvage-yard scene doing the action.",
    "Use real vehicles, wet mud, stripped car interiors, wires, tools, metal, rain, puddles, and industrial floodlights.",
    "Make it look like a dark cinematic frame from the actual song, not a design document."
  ].filter(Boolean).join("\n");

  const finalNegativePrompt = [
    negativePrompt,
    "character turnaround",
    "character model sheet",
    "reference sheet",
    "front side back view",
    "orthographic view",
    "T-pose",
    "blank white background",
    "white studio background",
    "empty hallway",
    "empty corridor",
    "architecture concept",
    "environment-only image",
    "no protagonist",
    "comic panel",
    "cartoon",
    "anime",
    "illustration",
    "sketch",
    "line art",
    "grayscale sketch",
    "blueprint",
    "wireframe",
    "stained glass border",
    "storybook frame",
    "fashion editorial",
    "glamour photoshoot",
    "futuristic showroom",
    "neon car show",
    "toy figure",
    "3D mannequin",
    "unrelated character",
    "different outfit",
    "different location",
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

  return {
    finalPrompt,
    finalNegativePrompt,
    finalSeed
  };
}


function base64ToUint8Array(base64: string) {
  const clean = base64.includes(",") ? base64.split(",").pop() || base64 : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function normalizeAiImageResult(result: any): Promise<BodyInit | null> {
  if (!result) return null;

  if (result instanceof Response) {
    return await result.arrayBuffer();
  }

  if (result instanceof ReadableStream) {
    return result;
  }

  if (result instanceof ArrayBuffer) {
    return result;
  }

  if (result instanceof Uint8Array) {
    return result;
  }

  if (typeof result === "string") {
    return base64ToUint8Array(result);
  }

  const possibleBase64 =
    result.image ||
    result.data ||
    result.result?.image ||
    result.result?.data ||
    result.output?.[0] ||
    null;

  if (typeof possibleBase64 === "string") {
    return base64ToUint8Array(possibleBase64);
  }

  return null;
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
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request, env)
      });
    }

    const url = new URL(request.url);

    if ((url.pathname === "/" || url.pathname === "/health") && request.method === "GET") {
      return jsonResponse({
        ok: true,
        name: "BeatVision Cloudflare AI Worker",
        routes: ["/generate-image"],
        model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
        continuity_prompting: true
      }, 200, request, env);
    }

    if (url.pathname !== "/generate-image" && url.pathname !== "/") {
      return jsonResponse({ ok: false, error: "Route not found." }, 404, request, env);
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Use POST for image generation." }, 405, request, env);
    }

    let payload: AnyObj = {};
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON body." }, 400, request, env);
    }

    const { finalPrompt, finalNegativePrompt, finalSeed } = buildPrompt(payload);

    const model =
      safeText(payload.model_name) ||
      "@cf/stabilityai/stable-diffusion-xl-base-1.0";

    const width = safeNum(payload.width, 1024);
    const height = safeNum(payload.height, 576);
    const num_steps = safeNum(payload.num_steps, 20);
    const guidance = safeNum(payload.guidance, 8.5);

    const input: AnyObj = {
      prompt: finalPrompt,
      negative_prompt: finalNegativePrompt,
      width,
      height,
      num_steps,
      guidance,
      seed: finalSeed
    };

    try {
      const result = await runImageModel(env, model, input);
      const body = await normalizeAiImageResult(result);

      if (!body) {
        return jsonResponse({
          ok: false,
          error: "Workers AI returned no usable image.",
          debug: {
            model,
            seed: finalSeed,
            prompt_used: finalPrompt,
            negative_prompt_used: finalNegativePrompt,
            result_type: typeof result,
            result_keys: result && typeof result === "object" ? Object.keys(result) : []
          }
        }, 500, request, env);
      }

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
          "X-BeatVision-Provider": "cloudflare_workers_ai",
          "X-BeatVision-Seed": String(finalSeed),
          ...getCorsHeaders(request, env)
        }
      });
    } catch (err: any) {
      return jsonResponse({
        ok: false,
        error: "Cloudflare image generation failed.",
        details: String(err?.message || err),
        debug: {
          model,
          seed: finalSeed,
          prompt_used: finalPrompt,
          negative_prompt_used: finalNegativePrompt
        }
      }, 500, request, env);
    }
  }
};
