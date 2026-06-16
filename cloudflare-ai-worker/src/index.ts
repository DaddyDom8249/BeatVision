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

  const projectId = safeText(payload.project_id, "beatvision-project");
  const projectTitle = safeText(payload.project_title, "Drain Rack Halo");
  const sceneNumber = safeNum(payload.scene_number, 1);
  const variationIndex = safeNum(payload.variation_index, 0);
  const sceneTitle = safeText(payload.scene_title, `Scene ${sceneNumber}`);

  const userSeed = safeNum(payload.seed, 0);
  const projectSeed = safeNum(payload.project_seed, hashString(projectId));
  const finalSeed = userSeed > 0 ? userSeed : projectSeed + sceneNumber * 100 + variationIndex;

  const sceneActionByNumber: Record<number, string> = {
    1: "early morning at an Alabama auto salvage yard, the female worker arrives near rows of stripped cars and the drain rack, dawn light, mud, metal, floodlights still glowing",
    2: "close cinematic shot of the female worker pulling tangled wire harnesses from a stripped vehicle dashboard, wet arms, gloves, neon yellow reflective safety vest, rain dripping from metal",
    3: "the female worker clearing strange objects from vehicles at the drain rack, draining fluids, puddles, oil sheen, industrial grit, LKQ pick-your-part atmosphere",
    4: "the female worker directing rows of vehicles and setting the line, forklifts and loaders in the background, wet gravel, steel rows like grave markers",
    5: "crush area of the salvage yard, engines rolled, parts ripped free, hydraulic machinery, mud, sparks, the worker surrounded by wrecked cars",
    6: "rainy humid Alabama workday, worker exhausted but focused, stripped cars and wet metal all around, cinematic dark industrial realism",
    7: "wide salvage-yard view with protagonist in foreground, rows of dead vehicles, floodlights, mud, puddles, orange dawn and blue shadows",
    8: "close-up of dirty gloved hands gripping copper wire harnesses and vehicle parts, rainwater, mud, scratched metal, physical labor",
    9: "the worker walking between wrecked cars in rain, reflective vest glowing, cinematic music video frame, dark emotional atmosphere",
    10: "the worker at the drain rack under harsh floodlights, fluids draining, oil, water, wires, tools, stripped vehicles, gritty realism"
  };

  const sceneAction =
    sceneActionByNumber[sceneNumber] ||
    rawScenePrompt ||
    "female salvage-yard worker actively pulling wire harnesses or draining fluids from a stripped wrecked vehicle in a rainy Alabama auto salvage yard";

  const BEATVISION_DNA = [
    "PHOTOREALISTIC CINEMATIC MUSIC VIDEO STILL.",
    "Dark gritty Alabama LKQ pick-your-part auto salvage yard.",
    "Female auto dismantling worker, neon yellow reflective safety vest, dirty grounded workwear, gloves, wet skin and clothes, tattooed forearms when visible.",
    "World details: drain rack, stripped cars, wire harnesses, muddy gravel, oil sheen puddles, rain, humid air, loaders, crushers, floodlights, wet metal, junkyard rows.",
    "Mood: dark, emotional, industrial, exhausted, powerful, real labor, cinematic realism.",
    "Camera: real lens, shallow depth of field, dramatic contrast, wet reflections, music-video framing.",
    "This must look like a frame from the actual song world, not unrelated concept art."
  ].join(" ");

  const finalPrompt = [
    BEATVISION_DNA,
    `Song/project title: ${projectTitle}.`,
    `Scene ${sceneNumber}: ${sceneTitle}.`,
    `Required scene action: ${sceneAction}.`,
    rawScenePrompt ? `Additional scene prompt: ${rawScenePrompt}.` : "",
    "The protagonist must be physically present inside the salvage yard scene doing the action.",
    "The image must clearly include multiple salvage-yard evidence elements: stripped wrecked vehicles, open car interiors, dangling wire harnesses, drain rack, greasy tools, wet mud, oil sheen puddles, scrap metal, loaders, crushers, or industrial floodlights.",
    "No beach. No sunset field. No cartoon room. No empty corridor. No model sheet. No random concept panel.",
    "Make it a finished cinematic frame, full color, realistic, grounded, dirty, wet, industrial."
  ].filter(Boolean).join("\n");

  const finalNegativePrompt = [
    negativePrompt,
    "beach",
    "ocean",
    "lake",
    "field",
    "empty sunset landscape, parking lot, roadside, clean road, open field, beach, lake, ocean",
    "person sitting at railing",
    "balcony",
    "peaceful vacation",
    "cartoon room",
    "comic panel",
    "stained glass border",
    "storybook illustration",
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
    "anime",
    "illustration",
    "sketch",
    "line art",
    "grayscale sketch",
    "blueprint",
    "wireframe",
    "fashion editorial",
    "glamour photoshoot",
    "futuristic showroom",
    "neon car show, taxi, yellow cab, clean intact sedan, roadside cleanup, parking lot, shovel, broom, rake",
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
