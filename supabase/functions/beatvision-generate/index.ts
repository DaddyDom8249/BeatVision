import { assertProjectOwner, BeatVisionAuthError, requireAuthenticatedUser } from "../_shared/auth.ts";

const CONTRACT = "1.1";
const MAX_BODY_BYTES = 2_000_000;
const MAX_LYRICS = 200_000;
const MAX_SCENES = 500;

type JsonObject = Record<string, unknown>;

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const configured = String(Deno.env.get("BEATVISION_ALLOWED_ORIGINS") || "")
    .split(",").map((v) => v.trim()).filter(Boolean);
  const allowed = configured.length ? configured : [
    "https://daddydom8249.github.io",
    "https://beat-vision-theta.vercel.app",
    "http://localhost:5173",
  ];
  return {
    "Access-Control-Allow-Origin": origin && allowed.includes(origin) ? origin : (origin ? "" : "*"),
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-beatvision-request",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function response(request: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown, field: string): string {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${field} is required.`);
  return result;
}

function numberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || text.trim();
  try { return JSON.parse(candidate); } catch {}
  const objectStart = candidate.indexOf("{");
  const objectEnd = candidate.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    try { return JSON.parse(candidate.slice(objectStart, objectEnd + 1)); } catch {}
  }
  const arrayStart = candidate.indexOf("[");
  const arrayEnd = candidate.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    try { return JSON.parse(candidate.slice(arrayStart, arrayEnd + 1)); } catch {}
  }
  throw new Error("Language provider returned malformed JSON.");
}

function asObject(value: unknown, label: string): JsonObject {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);
  return value;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty JSON array.`);
  return value;
}

function timestampRange(start: number, end: number): string {
  const fmt = (seconds: number) => {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  return `${fmt(start)} - ${fmt(end)}`;
}

function normalizeScore(value: unknown): number {
  const n = numberOr(value, 0);
  return Math.max(0, Math.min(100, Math.round(n <= 1 ? n * 100 : n)));
}

function normalizeStoryboard(raw: unknown): JsonObject[] {
  const parsed = asObject(raw, "Storyboard response");
  const source = Array.isArray(parsed.visual_beats) ? parsed.visual_beats : parsed.scenes;
  const beats = asArray(source, "Storyboard visual_beats");
  return beats.map((item, index) => {
    const b = asObject(item, `Storyboard beat ${index + 1}`);
    const start = numberOr(b.startTime ?? b.start_time, NaN);
    const end = numberOr(b.endTime ?? b.end_time, NaN);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error(`Storyboard beat ${index + 1} has invalid timing.`);
    }
    const duration = numberOr(b.duration_seconds, end - start);
    if (Math.abs(duration - (end - start)) > 0.25) {
      throw new Error(`Storyboard beat ${index + 1} duration does not match timestamps.`);
    }
    return {
      beatId: String(b.beatId ?? b.beat_id ?? `beat-${String(index + 1).padStart(2, "0")}`),
      scene_number: Math.max(1, Math.round(numberOr(b.scene ?? b.scene_number, index + 1))),
      startTime: start, endTime: end, duration_seconds: duration,
      sectionId: b.sectionId ?? b.section_id ?? null,
      lyricRange: b.lyricRange ?? b.lyric_range ?? null,
      lyricMeaning: b.lyricMeaning ?? b.lyric_meaning ?? null,
      narrativePurpose: b.narrativePurpose ?? b.narrative_purpose ?? null,
      emotionalState: b.emotionalState ?? b.emotional_state ?? b.emotion ?? null,
      emotionalIntensity: b.emotionalIntensity ?? null,
      characterState: b.characterState ?? b.character_state ?? null,
      environment: b.environment ?? b.location ?? null,
      action: b.action ?? null,
      visualConcept: b.visualConcept ?? b.visual_concept ?? null,
      symbolicElements: Array.isArray(b.symbolicElements) ? b.symbolicElements : [],
      cameraIntent: String(b.cameraIntent ?? b.camera_intent ?? ""),
      transitionIntent: String(b.transitionIntent ?? b.transition_intent ?? ""),
      worldConstraints: Array.isArray(b.worldConstraints) ? b.worldConstraints : [],
      previousBeat: b.previousBeat ?? b.previous_beat ?? null,
      nextBeat: b.nextBeat ?? b.next_beat ?? null,
      visualContinuityRequirements: Array.isArray(b.visualContinuityRequirements) ? b.visualContinuityRequirements : [],
      reusePolicy: String(b.reusePolicy ?? b.reuse_policy ?? "new_visual_event"),
      description: String(b.description ?? b.visual_description ?? b.visualConcept ?? b.visual_concept ?? "").trim(),
      visual_direction: String(b.visual_direction ?? b.visualDirection ?? b.visualConcept ?? b.visual_concept ?? ""),
      location: String(b.location ?? b.environment ?? ""),
      emotion: String(b.emotion ?? b.emotionalState ?? b.emotional_state ?? ""),
      continuity_notes: String(b.continuity_notes ?? b.continuityNotes ?? ""),
      timestamp_range: String(b.timestamp_range ?? timestampRange(start, end)),
      scene_title: String(b.scene_title ?? b.narrativePurpose ?? b.visualConcept ?? `Scene ${index + 1}`),
      visual_description: String(b.visual_description ?? [b.visualConcept, b.action].filter(Boolean).join(" ")),
      camera_direction: String(b.camera_direction ?? b.cameraIntent ?? ""),
      mood: String(b.mood ?? b.emotionalState ?? b.emotion ?? ""),
      lyric_moment: String(b.lyric_moment ?? b.lyricMeaning ?? b.lyric_meaning ?? ""),
      transition_style: String(b.transition_style ?? b.transitionIntent ?? b.transition_intent ?? ""),
    };
  });
}

function validateStoryboard(beats: JsonObject[], duration: number): void {
  let previousEnd = 0;
  for (const beat of beats) {
    const start = Number(beat.startTime), end = Number(beat.endTime);
    if (start < previousEnd - 0.25) throw new Error(`Storyboard beat ${beat.beatId} overlaps the previous beat.`);
    if (start < -0.01 || end <= start) throw new Error(`Storyboard beat ${beat.beatId} has invalid timing.`);
    previousEnd = end;
  }
  if (duration > 0) {
    if (Number(beats[0].startTime) > 0.5) throw new Error("Storyboard does not begin at the start of the song.");
    if (previousEnd < duration - 0.5) throw new Error("Storyboard does not cover the full song duration.");
    if (beats.some((b) => Number(b.endTime) > duration + 0.5)) throw new Error("Storyboard contains a beat outside the song duration.");
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function supabaseUrl(): string {
  const value = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  if (!value) throw new Error("Supabase URL is not configured.");
  return value;
}

async function runRequest(
  request: Request,
  userId: string,
  projectId: string,
  payload: JsonObject,
  handler: () => Promise<unknown>,
): Promise<unknown> {
  const token = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const key = String(request.headers.get("X-BeatVision-Request") || payload.requestKey || "").trim() || await sha256(JSON.stringify(payload));
  const inputHash = await sha256(JSON.stringify(payload));
  const base = supabaseUrl();
  const headers = {
    apikey: String(Deno.env.get("SUPABASE_ANON_KEY") || ""),
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const insert = await fetch(`${base}/rest/v1/generation_runs`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({
      project_id: projectId, owner_id: userId, action: String(payload.action),
      request_key: key, input_hash: inputHash, status: "pending",
    }),
  });

  let run: JsonObject | null = null;
  if (insert.ok) {
    const rows = await insert.json();
    run = Array.isArray(rows) ? rows[0] : rows;
  } else if (insert.status === 409) {
    const existing = await fetch(
      `${base}/rest/v1/generation_runs?select=*&project_id=eq.${encodeURIComponent(projectId)}&request_key=eq.${encodeURIComponent(key)}&limit=1`,
      { headers },
    );
    if (!existing.ok) throw new Error("Could not inspect the existing generation run.");
    const rows = await existing.json();
    run = Array.isArray(rows) ? rows[0] : null;
    if (!run) throw new Error("Generation request conflict could not be resolved.");
    if (String(run.input_hash) !== inputHash) throw new Error("Generation request key was reused with different input.");
    if (run.status === "completed" && run.output_json !== null) return run.output_json;
    if (run.status === "running" || run.status === "pending") {
      const startedAt = run.started_at ? Date.parse(String(run.started_at)) : 0;
      const staleAfterMs = 10 * 60 * 1000;
      if (startedAt > 0 && Date.now() - startedAt < staleAfterMs) {
        throw new Error("This generation request is already running.");
      }
      const reclaim = await fetch(`${base}/rest/v1/generation_runs?id=eq.${encodeURIComponent(String(run.id))}`, {
        method: "PATCH", headers, body: JSON.stringify({
          status: "pending",
          error_code: "STALE_RUN_RECLAIMED",
          error_message: "Previous generation attempt exceeded its execution lease.",
          output_json: null,
        }),
      });
      if (!reclaim.ok) throw new Error("Could not reclaim the stale generation request.");
    } else {
      const retry = await fetch(`${base}/rest/v1/generation_runs?id=eq.${encodeURIComponent(String(run.id))}`, {
        method: "PATCH", headers, body: JSON.stringify({ status: "pending", error_code: null, error_message: null, output_json: null }),
      });
      if (!retry.ok) throw new Error("Could not retry the failed generation request.");
    }
  } else {
    throw new Error(`Could not create generation run (${insert.status}).`);
  }

  const runId = String(run?.id || "");
  if (!runId) throw new Error("Generation run ID was not created.");

  const markRunning = await fetch(`${base}/rest/v1/generation_runs?id=eq.${encodeURIComponent(runId)}`, {
    method: "PATCH", headers, body: JSON.stringify({ status: "running", started_at: new Date().toISOString(), provider: "arena" }),
  });
  if (!markRunning.ok) throw new Error("Could not start generation run.");

  try {
    const output = await handler();
    const finish = await fetch(`${base}/rest/v1/generation_runs?id=eq.${encodeURIComponent(runId)}`, {
      method: "PATCH", headers, body: JSON.stringify({ status: "completed", output_json: output, completed_at: new Date().toISOString() }),
    });
    if (!finish.ok) throw new Error("Generation completed but its result could not be persisted.");
    return output;
  } catch (error) {
    await fetch(`${base}/rest/v1/generation_runs?id=eq.${encodeURIComponent(runId)}`, {
      method: "PATCH", headers, body: JSON.stringify({
        status: "failed", error_code: "GENERATION_FAILED",
        error_message: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
      }),
    });
    throw error;
  }
}

async function callArenaLanguage(prompt: string, mode = "generate", durationSeconds?: number): Promise<unknown> {
  const base = String(Deno.env.get("ARENA_GATEWAY_URL") || "").replace(/\/$/, "");
  const token = String(Deno.env.get("ARENA_GATEWAY_TOKEN") || "");
  if (!base || !token) throw new Error("BeatVision language provider is not configured.");
  const res = await fetch(`${base}/v1/language/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-BeatVision-Contract": CONTRACT,
      "X-BeatVision-Request": crypto.randomUUID(),
    },
    body: JSON.stringify({
      contract_version: CONTRACT,
      operation: "generate",
      payload: { prompt, mode, duration_seconds: durationSeconds },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Language provider returned HTTP ${res.status}: ${text.slice(0, 500)}`);
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error("Language provider returned invalid JSON."); }
  return (isRecord(data) && "result" in data) ? data.result : data;
}

function requiredFields(value: JsonObject, fields: string[], label: string): void {
  for (const field of fields) {
    const v = value[field];
    if (v === null || v === undefined || String(v).trim() === "" || String(v).trim() === "—") {
      throw new Error(`${label} is missing required field: ${field}.`);
    }
  }
}

async function generate(body: JsonObject): Promise<unknown> {
  const action = nonEmpty(body.action, "action");
  const title = nonEmpty(body.projectTitle, "projectTitle");
  const lyrics = String(body.lyrics ?? "");
  const style = String(body.style ?? "Cinematic").trim() || "Cinematic";
  const notes = String(body.notes ?? "");
  const seed = numberOr(body.seed, 1);

  if (lyrics.length > MAX_LYRICS) throw new Error("Lyrics exceed the maximum supported length.");
  if (Array.isArray(body.scenes) && body.scenes.length > MAX_SCENES) throw new Error("Too many scenes in one request.");

  if (action === "generate_world_report") {
    const report = asObject(await callArenaLanguage(
      `Analyze this song as BeatVision's visual-world director. Song: "${title}". Style: ${style}. Lyrics:\n${lyrics}\n${notes ? `Notes: ${notes}` : ""}\nSeed: ${seed}. Return ONLY JSON with song_summary,emotional_core,main_visual_world,color_palette,lighting_style,main_characters,symbolic_objects,key_locations,story_direction,creative_match_score.`
    ), "Visual World Report");
    requiredFields(report, ["song_summary","emotional_core","main_visual_world","color_palette","lighting_style","main_characters","symbolic_objects","key_locations","story_direction"], "Visual World Report");
    report.creative_match_score = normalizeScore(report.creative_match_score);
    return report;
  }

  if (action === "generate_storyboard") {
    const duration = numberOr(body.songDurationSeconds ?? body.song_duration_seconds ?? body.durationSeconds, 0);
    const raw = await callArenaLanguage(
      `Create BeatVision's complete song-grounded cinematic visual-beat plan. Song: "${title}". Style: ${style}. Duration: ${duration || "unknown"} seconds. Lyrics/transcript:\n${lyrics}\nWorld: ${JSON.stringify(body.worldReport || {})}. Cover the entire song. Never target a fixed scene count. Choose beat count from musical structure, lyric density, narrative events, instrumental intervals and pacing. Each beat must be independently renderable, semantically distinct, and timestamped. Return ONLY JSON with sections, visual_beats, coverage_notes. Each visual beat must contain beatId,startTime,endTime,sectionId,lyricRange,lyricMeaning,narrativePurpose,emotionalState,emotionalIntensity,characterState,environment,action,visualConcept,symbolicElements,cameraIntent,transitionIntent,worldConstraints,previousBeat,nextBeat,visualContinuityRequirements,reusePolicy,description,duration_seconds.`,
      "storyboard", duration
    );
    const beats = normalizeStoryboard(raw);
    validateStoryboard(beats, duration);
    return beats;
  }

  const prompts: Record<string, string> = {
    generate_characters: `Define BeatVision characters and environment. Song: "${title}". Style: ${style}. Lyrics: ${lyrics}. World: ${JSON.stringify(body.worldReport || {})}. Return ONLY JSON with main_character,supporting_character,main_environment,visual_atmosphere,wardrobe_style,world_rules.`,
    generate_style_bible: `Create BeatVision's production World Style Bible. Song: "${title}". Style: ${style}. World: ${JSON.stringify(body.worldReport || {})}. Character/environment: ${JSON.stringify(body.charEnv || {})}. Seed: ${seed}. Return ONLY JSON with overall_visual_style,color_rules,lighting_rules,camera_rules,character_consistency_rules,environment_rules,symbolic_motifs,things_to_avoid.`,
    generate_character_sheet: `Create BeatVision's detailed Character Sheet. Song: "${title}". Style: ${style}. World: ${JSON.stringify(body.worldReport || {})}. Context: ${JSON.stringify(body.charEnv || {})}. Seed: ${seed}. Return ONLY JSON with character_role,appearance,wardrobe,body_language,facial_expression,personality_energy,recurring_visual_traits,consistency_notes.`,
    generate_environment_sheet: `Create BeatVision's detailed Environment Sheet. Song: "${title}". Style: ${style}. World: ${JSON.stringify(body.worldReport || {})}. Context: ${JSON.stringify(body.charEnv || {})}. Seed: ${seed}. Return ONLY JSON with main_world_description,key_locations,weather_atmosphere,textures_materials,background_details,lighting_conditions,recurring_objects,world_consistency_rules.`,
  };

  if (prompts[action]) return asObject(await callArenaLanguage(prompts[action]), action);

  if (action === "generate_scene_prompts") {
    return asArray(await callArenaLanguage(
      `Create BeatVision visual prompt packages for every storyboard scene. Song: "${title}". Style: ${style}. Style Bible: ${JSON.stringify(body.styleBible || {})}. Character: ${JSON.stringify(body.characterSheet || {})}. Environment: ${JSON.stringify(body.environmentSheet || {})}. Scenes: ${JSON.stringify(body.scenes || [])}. Return ONLY JSON array with scene_number,scene_title,timestamp_range,main_image_prompt,camera_framing,lighting_direction,character_placement,mood,environment_details,symbolic_objects,style_consistency_notes,negative_prompt.`
    ), "Scene prompts");
  }

  if (action === "refresh_scene" || action === "refresh_scene_prompt") {
    const n = numberOr(body.sceneNumber, 1);
    const source = body.existingScene || body.scenePrompt || {};
    return asObject(await callArenaLanguage(
      `Regenerate BeatVision scene ${n}. Song: "${title}". Style: ${style}. Lyrics excerpt: ${lyrics.slice(0, 500)}. World: ${JSON.stringify(body.worldReport || {})}. Existing scene: ${JSON.stringify(source)}. Seed: ${seed}. Create a genuinely different visual event, location, camera and composition while preserving timestamp_range exactly. Return ONLY JSON with scene_number,scene_title,timestamp_range,visual_description,camera_direction,mood,location,lyric_moment,transition_style,main_image_prompt,negative_prompt.`
    ), action);
  }

  if (action === "generate_scene_previews") {
    return asArray(await callArenaLanguage(
      `Create BeatVision cinematic preview DESCRIPTIONS for every scene. These are metadata only, not generated images. Never invent image URLs and never return placeholder gradients. Song: "${title}". Style: ${style}. World: ${JSON.stringify(body.worldReport || {})}. Scene prompts: ${JSON.stringify(body.scenePrompts || [])}. Return ONLY JSON array with scene_number,preview_title,preview_description,dominant_colors,mood,location,symbolic_object,camera_direction.`
    ), "Scene previews");
  }

  if (action === "generate_scene_image_prompt" || action === "generate_all_scene_image_prompts") {
    const items = action === "generate_all_scene_image_prompts"
      ? asArray(body.scenePrompts || [], "scenePrompts")
      : [body.scenePrompt || {}];
    const results: JsonObject[] = [];
    for (let i = 0; i < items.length; i++) {
      const scene = asObject(items[i], `Scene prompt ${i + 1}`);
      const n = numberOr(scene.scene_number, i + 1);
      const prompt = asObject(await callArenaLanguage(
        `Create a production-ready cinematic image-generation prompt for BeatVision scene ${n}. Song: "${title}". Style: ${style}. Scene: ${JSON.stringify(scene)}. Style Bible: ${JSON.stringify(body.styleBible || {})}. Character: ${JSON.stringify(body.characterSheet || {})}. Environment: ${JSON.stringify(body.environmentSheet || {})}. Consistency: ${JSON.stringify(body.consistency || {})}. Return ONLY JSON with prompt_used,prompt_summary,negative_prompt,character_presence,location,style_consistency_summary.`
      ), `Scene image prompt ${n}`);
      requiredFields(prompt, ["prompt_used","prompt_summary"], `Scene image prompt ${n}`);
      results.push({ scene_number: n, scene_title: scene.scene_title ?? `Scene ${n}`, timestamp_range: scene.timestamp_range ?? null, ...prompt });
    }
    return results;
  }

  throw new Error(`Unsupported generation action: ${action}`);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return response(request, { error: "Method Not Allowed" }, 405);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return response(request, { error: "Request body is too large." }, 413);

  let body: unknown;
  try { body = await request.json(); } catch { return response(request, { error: "Invalid request body." }, 400); }
  if (!isRecord(body)) return response(request, { error: "Request body must be a JSON object." }, 400);
  if (JSON.stringify(body).length > MAX_BODY_BYTES) return response(request, { error: "Request body is too large." }, 413);

  let user: { id: string };
  try { user = await requireAuthenticatedUser(request); }
  catch (error) {
    return response(request, { error: error instanceof Error ? error.message : "Authentication failed." }, error instanceof BeatVisionAuthError ? 401 : 500);
  }

  let projectId: string;
  try { projectId = nonEmpty(body.projectId ?? body.project_id, "projectId"); }
  catch (error) { return response(request, { error: error instanceof Error ? error.message : "projectId is required." }, 400); }

  try { await assertProjectOwner(request, projectId, user.id); }
  catch (error) {
    const status = Number((error as { status?: number })?.status) || (/denied/i.test(String(error)) ? 403 : 500);
    return response(request, { error: error instanceof Error ? error.message : "Project authorization failed." }, status);
  }

  try {
    const action = nonEmpty(body.action, "action");
    const payload = { ...body, projectId, action };
    const result = await runRequest(request, user.id, projectId, payload, () => generate(payload));
    return response(request, { success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /already running/i.test(message) ? 409 : /unsupported generation action/i.test(message) ? 400 : 500;
    return response(request, { success: false, error: message, action: body.action ?? null }, status);
  }
});
