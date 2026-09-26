import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CONTRACT = "1.1";
const PIPELINE_ACTION = "pipeline";
const ARENA = "https://beatvision-provider-arena.richardcranium466.workers.dev";

type Obj = Record<string, unknown>;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function env(name: string): string {
  return String(Deno.env.get(name) || "").trim();
}

function bearer(req: Request): string {
  const value = req.headers.get("Authorization") || "";
  const m = value.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("Authentication required.");
  return m[1].trim();
}

async function userId(req: Request): Promise<string> {
  const token = bearer(req);
  const base = env("SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  if (!base || !key) throw new Error("Supabase authentication configuration is missing.");
  const r = await fetch(base + "/auth/v1/user", {
    headers: { apikey: key, Authorization: "Bearer " + token },
  });
  if (!r.ok) throw new Error("Invalid or expired authentication session.");
  const u = await r.json();
  if (!u?.id) throw new Error("Authenticated user could not be established.");
  return String(u.id);
}

function baseUrl(): string {
  const v = env("SUPABASE_URL").replace(/\/$/, "");
  if (!v) throw new Error("SUPABASE_URL is missing.");
  return v;
}

function headers(token: string): HeadersInit {
  const key = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  return {
    apikey: key,
    Authorization: "Bearer " + token,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function db(token: string, path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(baseUrl() + "/rest/v1/" + path, {
    ...init,
    headers: { ...headers(token), ...(init.headers || {}) },
  });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error("Database request failed (" + r.status + "): " + String(data?.message || data?.error || text).slice(0, 600));
  return data;
}

async function getProject(token: string, projectId: string, uid: string): Promise<Obj> {
  const rows = await db(token, "projects?select=*&id=eq." + encodeURIComponent(projectId) + "&owner_id=eq." + encodeURIComponent(uid) + "&limit=1");
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Project access denied.");
  return rows[0];
}

async function one(token: string, table: string, projectId: string): Promise<Obj | null> {
  const rows = await db(token, table + "?select=*&project_id=eq." + encodeURIComponent(projectId) + "&limit=1");
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function saveOne(token: string, table: string, projectId: string, uid: string, value: Obj): Promise<Obj> {
  const existing = await one(token, table, projectId);
  const payload: Obj = { ...value, project_id: projectId, owner_id: uid, updated_at: new Date().toISOString() };
  if (existing?.id) {
    return (await db(token, table + "?id=eq." + encodeURIComponent(String(existing.id)), {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    }))[0];
  }
  return (await db(token, table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  }))[0];
}

async function saveProject(token: string, projectId: string, patch: Obj): Promise<void> {
  await db(token, "projects?id=eq." + encodeURIComponent(projectId), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

async function invokeFunction(token: string, slug: string, body: Obj): Promise<any> {
  const requestId = crypto.randomUUID();
  const isGet = method === "GET";
  const query = isGet
    ? "?" + new URLSearchParams(Object.entries({
        path: String(body.path || ""),
        project_id: String(body.payload?.project_id || ""),
        target_duration_seconds: String(body.payload?.target_duration_seconds || ""),
      }).filter(([, v]) => v)).toString()
    : "";
  const r = await fetch(baseUrl() + "/functions/v1/" + slug + query, {
    method,
    headers: {
      ...headers(token),
      "X-BeatVision-Request": requestId,
    },
    ...(isGet ? {} : { body: JSON.stringify(body) }),
  });
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(slug + " returned HTTP " + r.status + ": " + String(data?.error || data?.message || text).slice(0, 1200));
  return data;
}

async function arena(token: string, path: string, operation: string, payload: Obj, method = "POST"): Promise<any> {
  const body = {
    contract_version: CONTRACT,
    operation,
    path,
    payload,
    request_id: crypto.randomUUID(),
  };
  const r = await fetch(baseUrl() + "/functions/v1/beatvision-arena", {
    method,
    headers: {
      ...headers(token),
      "X-BeatVision-Request": String(body.request_id),
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) throw new Error("Arena " + path + " returned HTTP " + r.status + ": " + String(data?.error || data?.message || text).slice(0, 1400));
  return data;
}

async function getPipeline(token: string, projectId: string): Promise<{ id?: string; state: Obj }> {
  const rows = await db(token, "generation_runs?select=*&project_id=eq." + encodeURIComponent(projectId) + "&action=eq." + encodeURIComponent(PIPELINE_ACTION) + "&request_key=eq." + encodeURIComponent("pipeline:" + projectId) + "&limit=1");
  if (!rows?.length) return { state: { stage: "world_report", status: "idle", cursor: 0, updated_at: new Date().toISOString() } };
  return { id: String(rows[0].id), state: (rows[0].output_json && typeof rows[0].output_json === "object") ? rows[0].output_json : { stage: "world_report", status: "idle", cursor: 0 } };
}

async function savePipeline(token: string, projectId: string, uid: string, current: { id?: string; state: Obj }, state: Obj): Promise<string> {
  const payload = {
    project_id: projectId,
    owner_id: uid,
    action: PIPELINE_ACTION,
    request_key: "pipeline:" + projectId,
    input_hash: "pipeline:" + projectId,
    status: state.status === "completed" ? "completed" : state.status === "failed" ? "failed" : "running",
    provider: "beatvision-pipeline",
    model: "stage-controller",
    output_json: state,
    error_code: state.error_code ?? null,
    error_message: state.error_message ?? null,
    started_at: state.started_at ?? new Date().toISOString(),
    completed_at: state.status === "completed" ? new Date().toISOString() : null,
  };
  if (current.id) {
    await db(token, "generation_runs?id=eq." + encodeURIComponent(current.id), {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    });
    return current.id;
  }
  const rows = await db(token, "generation_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  return String(rows[0].id);
}

function resultOf(data: any): any {
  if (data?.success === false) throw new Error(String(data.error || "Generation failed."));
  return data?.data ?? data?.result ?? data;
}

function text(v: unknown): string { return String(v ?? "").trim(); }

async function stageWorld(token: string, project: Obj, uid: string): Promise<void> {
  const data = await invokeFunction(token, "beatvision-generate", {
    projectId: project.id, projectTitle: project.title, lyrics: project.lyrics || "",
    style: project.selected_style || "Cinematic", notes: project.optional_notes || "",
    action: "generate_world_report",
  });
  const w = resultOf(data);
  await saveOne(token, "visual_world_reports", String(project.id), uid, {
    song_summary: text(w.song_summary), emotional_core: text(w.emotional_core),
    main_visual_world: text(w.main_visual_world), color_palette: text(w.color_palette),
    lighting_style: text(w.lighting_style), main_characters: text(w.main_characters),
    symbolic_objects: text(w.symbolic_objects), key_locations: text(w.key_locations),
    story_direction: text(w.story_direction),
    creative_match_score: Math.max(0, Math.min(1, Number(w.creative_match_score ?? 0) / (Number(w.creative_match_score ?? 0) > 1 ? 100 : 1))),
    approved: false, needs_review: false,
  });
  await saveProject(token, String(project.id), { status: "World Revealed" });
}

async function stageCharacters(token: string, project: Obj, uid: string, world: Obj): Promise<void> {
  const data = await invokeFunction(token, "beatvision-generate", {
    projectId: project.id, projectTitle: project.title, lyrics: project.lyrics || "",
    style: project.selected_style || "Cinematic", worldReport: world, action: "generate_characters",
  });
  const v = resultOf(data);
  await saveOne(token, "character_environments", String(project.id), uid, v);
  await saveProject(token, String(project.id), { status: "Generating World Assets" });
}

async function stageStyle(token: string, project: Obj, uid: string, world: Obj, chars: Obj): Promise<void> {
  const data = await invokeFunction(token, "beatvision-generate", {
    projectId: project.id, projectTitle: project.title, lyrics: project.lyrics || "",
    style: project.selected_style || "Cinematic", worldReport: world, charEnv: chars, action: "generate_style_bible",
  });
  await saveOne(token, "world_style_bibles", String(project.id), uid, resultOf(data));
}

async function stageSheets(token: string, project: Obj, uid: string, world: Obj, chars: Obj): Promise<void> {
  const [c,e] = await Promise.all([
    invokeFunction(token, "beatvision-generate", { projectId: project.id, projectTitle: project.title, lyrics: project.lyrics || "", style: project.selected_style || "Cinematic", worldReport: world, charEnv: chars, action: "generate_character_sheet" }),
    invokeFunction(token, "beatvision-generate", { projectId: project.id, projectTitle: project.title, lyrics: project.lyrics || "", style: project.selected_style || "Cinematic", worldReport: world, charEnv: chars, action: "generate_environment_sheet" }),
  ]);
  await saveOne(token, "character_sheets", String(project.id), uid, resultOf(c));
  await saveOne(token, "environment_sheets", String(project.id), uid, resultOf(e));
}

async function stageStoryboard(token: string, project: Obj, uid: string, world: Obj): Promise<number> {
  const duration = Number(project.song_duration || 0);
  if (!(duration > 0)) throw new Error("Project song_duration is missing. The upload path must persist the real audio duration before the pipeline can create a complete storyboard.");
  const data = await invokeFunction(token, "beatvision-generate", {
    projectId: project.id, projectTitle: project.title, lyrics: project.lyrics || "",
    style: project.selected_style || "Cinematic", worldReport: world,
    songDurationSeconds: duration, durationSeconds: duration, action: "generate_storyboard",
  });
  const beats = resultOf(data);
  if (!Array.isArray(beats) || !beats.length) throw new Error("Storyboard generation returned no beats.");
  for (const beat of beats) {
    const n = Number(beat.scene_number || 0);
    if (!(n > 0)) throw new Error("Storyboard contains an invalid scene number.");
    const existing = await db(token, "storyboard_scenes?select=id&project_id=eq." + encodeURIComponent(String(project.id)) + "&scene_number=eq." + n + "&limit=1");
    const row = {
      project_id: project.id, owner_id: uid, scene_number: n,
      timestamp_range: text(beat.timestamp_range),
      scene_title: text(beat.scene_title),
      visual_description: text(beat.visual_description || beat.description),
      camera_direction: text(beat.camera_direction),
      mood: text(beat.mood || beat.emotion),
      location: text(beat.location),
      lyric_moment: text(beat.lyric_moment),
      transition_style: text(beat.transition_style),
      approved: false, needs_review: false,
      updated_after_approval: false,
    };
    if (existing?.length) await db(token, "storyboard_scenes?id=eq." + existing[0].id, { method:"PATCH", headers:{Prefer:"return=minimal"}, body:JSON.stringify(row) });
    else await db(token, "storyboard_scenes", { method:"POST", headers:{Prefer:"return=minimal"}, body:JSON.stringify(row) });
  }
  await saveProject(token, String(project.id), { status: "Storyboard Approved", storyboard_approved: false });
  return beats.length;
}

async function readWorld(token: string, projectId: string): Promise<Obj> {
  return (await one(token, "visual_world_reports", projectId)) || {};
}

async function readChars(token: string, projectId: string): Promise<Obj> {
  return (await one(token, "character_environments", projectId)) || {};
}

async function readBible(token: string, projectId: string): Promise<Obj> {
  return (await one(token, "world_style_bibles", projectId)) || {};
}

async function readCharSheet(token: string, projectId: string): Promise<Obj> {
  return (await one(token, "character_sheets", projectId)) || {};
}

async function readEnvSheet(token: string, projectId: string): Promise<Obj> {
  return (await one(token, "environment_sheets", projectId)) || {};
}

async function scenes(token: string, projectId: string): Promise<Obj[]> {
  return await db(token, "storyboard_scenes?select=*&project_id=eq." + encodeURIComponent(projectId) + "&order=scene_number.asc");
}

async function stagePrompts(token: string, project: Obj, uid: string): Promise<number> {
  const ss = await scenes(token, String(project.id));
  if (!ss.length) throw new Error("Cannot generate scene prompts without storyboard scenes.");
  const data = await invokeFunction(token, "beatvision-generate", {
    projectId: project.id, projectTitle: project.title, lyrics: project.lyrics || "",
    style: project.selected_style || "Cinematic", worldReport: await readWorld(token, String(project.id)),
    styleBible: await readBible(token, String(project.id)), characterSheet: await readCharSheet(token, String(project.id)),
    environmentSheet: await readEnvSheet(token, String(project.id)), scenes: ss, action: "generate_scene_prompts",
  });
  const prompts = resultOf(data);
  if (!Array.isArray(prompts) || prompts.length !== ss.length) throw new Error("Scene prompt count does not match storyboard scene count.");
  for (let i=0;i<ss.length;i++) {
    const p = prompts[i] || {};
    const row = {
      project_id: project.id, scene_number: Number(p.scene_number || ss[i].scene_number),
      scene_title: text(p.scene_title || ss[i].scene_title), timestamp_range: text(p.timestamp_range || ss[i].timestamp_range),
      main_image_prompt: text(p.main_image_prompt), camera_framing: text(p.camera_framing),
      lighting_direction: text(p.lighting_direction), character_placement: text(p.character_placement),
      mood: text(p.mood), environment_details: text(p.environment_details),
      symbolic_objects: text(p.symbolic_objects), style_consistency_notes: text(p.style_consistency_notes),
      negative_prompt: text(p.negative_prompt), approved: true,
    };
    const existing = await db(token, "scene_visual_prompts?select=id&project_id=eq." + encodeURIComponent(String(project.id)) + "&scene_number=eq." + row.scene_number + "&limit=1");
    if(existing?.length) await db(token, "scene_visual_prompts?id=eq."+existing[0].id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(row)});
    else await db(token,"scene_visual_prompts",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(row)});
  }
  await saveProject(token, String(project.id), { status: "Ready for Image Generation", scene_prompts_approved: true });
  return ss.length;
}

async function stageImage(token: string, project: Obj, uid: string, sceneNumber: number): Promise<void> {
  const ss = await scenes(token, String(project.id));
  const scene = ss.find(x => Number(x.scene_number) === sceneNumber);
  if (!scene) throw new Error("Storyboard scene " + sceneNumber + " not found.");
  const promptRows = await db(token, "scene_visual_prompts?select=*&project_id=eq." + encodeURIComponent(String(project.id)) + "&scene_number=eq." + sceneNumber + "&limit=1");
  const p = promptRows?.[0];
  if (!p?.main_image_prompt) throw new Error("Scene " + sceneNumber + " has no image prompt.");
  const payload = {
    contract_version: CONTRACT, operation: "sceneImages",
    payload: {
      project_id: project.id,
      style: project.selected_style || "Cinematic",
      world: {
        character_concept: (await readCharSheet(token, String(project.id))).appearance || "",
        character_sheet: await readCharSheet(token, String(project.id)),
        environment_sheet: await readEnvSheet(token, String(project.id)),
        locations: [p.environment_details || scene.location],
        visual_motifs: (await readWorld(token, String(project.id))).symbolic_objects || "",
        continuity_rules: (await readBible(token, String(project.id))).character_consistency_rules || "",
      },
      storyboard: { scenes: [{
        scene: Number(scene.scene_number), beatId: String(scene.id),
        startTime: 0, endTime: Math.min(5.5, Math.max(2.5, Number(project.song_duration || 4))),
        duration_seconds: Math.min(5.5, Math.max(2.5, Number(project.song_duration || 4))),
        scene_title: scene.scene_title, visual_description: scene.visual_description,
        camera_direction: scene.camera_direction, mood: scene.mood, location: scene.location,
        lyric_moment: scene.lyric_moment, previousBeat: null, nextBeat: null,
        reusePolicy: "new_visual_event",
      }]},
    },
  };
  const data = await arena(token, "/v1/image/scenes", "sceneImages", payload.payload);
  const image = data?.result?.images?.[0];
  if (!image?.image_url) throw new Error("Pixazo returned no image URL for scene " + sceneNumber + ".");
  const existing = await db(token, "scene_images?select=id&project_id=eq." + encodeURIComponent(String(project.id)) + "&scene_number=eq." + sceneNumber + "&limit=1");
  const row = {
    project_id: project.id, owner_id: uid, scene_index: sceneNumber, scene_number: sceneNumber,
    scene_title: scene.scene_title, prompt_text: p.main_image_prompt, image_prompt: p.main_image_prompt,
    prompt: p.main_image_prompt, image_url: image.image_url, provider: "pixazo", provider_name: "pixazo",
    provider_model: image.model || null, provider_request_id: data.request_id || null,
    provider_response: image, status: "generated", generation_status: "completed", real_generated: true,
    manual_upload: false, pending: false, failed: false, placeholder: false, selected: true,
    timestamp_range: scene.timestamp_range, prompt_used: p.main_image_prompt, prompt_summary: p.main_image_prompt,
  };
  if(existing?.length) await db(token,"scene_images?id=eq."+existing[0].id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(row)});
  else await db(token,"scene_images",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(row)});
}

async function startMotion(token: string, project: Obj): Promise<string> {
  const ss = await scenes(token, String(project.id));
  const imgs = await db(token, "scene_images?select=scene_number,image_url,id&project_id=eq." + encodeURIComponent(String(project.id)) + "&order=scene_number.asc");
  if (imgs.length !== ss.length) throw new Error("Motion cannot start until every storyboard scene has a generated image.");
  const jobId = "bv-" + String(project.id).replace(/-/g,"").slice(0,20) + "-" + Date.now().toString(36);
  const data = await arena(token, "/v1/video/animate", "animate", {
    project_id: project.id,
    job_id: jobId,
    storyboard: { scenes: ss.map(s => ({
      scene: Number(s.scene_number), scene_title: s.scene_title,
      duration_seconds:  Math.min(5.5, Math.max(2.5, Number(project.song_duration || 4))),
      timestamp_range: s.timestamp_range, visual_description: s.visual_description,
      camera_direction: s.camera_direction, mood: s.mood, location: s.location, lyric_moment: s.lyric_moment,
    }))},
    images: { images: imgs.map(i => ({ scene: Number(i.scene_number), image_url: i.image_url, asset_id: String(i.id) }))},
  });
  return String(data?.job_id || jobId);
}

async function motionStatus(token: string, jobId: string): Promise<any> {
  return await arena(token, "/v1/video/animate/jobs/" + encodeURIComponent(jobId), "animationJob", { job_id: jobId }, "POST");
}

async function saveMotionClips(token: string, project: Obj, uid: string, data: any): Promise<void> {
  const clips = Array.isArray(data?.clips) ? data.clips : Array.isArray(data?.result?.clips) ? data.result.clips : [];
  for (const clip of clips) {
    const n = Number(clip.scene || 0); if (!(n > 0)) continue;
    const existing = await db(token, "motion_clips?select=id&project_id=eq." + encodeURIComponent(String(project.id)) + "&scene_number=eq." + n + "&limit=1");
    const row = {
      project_id: project.id, scene_number:n, scene_title: clip.scene_title || null, clip_url: clip.video_url || clip.clip_url || null,
      duration: clip.duration_seconds || clip.duration || null, motion_effect:"Cinematic", transition_in:"Fade", transition_out:"Fade",
      generation_status: clip.status === "animated" ? "ready_for_review" : "failed", status: clip.status === "animated" ? "ready_for_review" : "failed",
      pending:false, failed:clip.status !== "animated", provider_job_id: data.job_id || null, prompt_used: "BeatVision cinematic motion",
    };
    if(existing?.length) await db(token,"motion_clips?id=eq."+existing[0].id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(row)});
    else await db(token,"motion_clips",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(row)});
  }
}

async function startRender(token: string, project: Obj): Promise<any> {
  const clips = await db(token, "motion_clips?select=id,scene_number,clip_url,duration,status,generation_status&project_id=eq." + encodeURIComponent(String(project.id)) + "&order=scene_number.asc");
  if (!clips.length) throw new Error("Render cannot start without motion clips.");
  const ss = await scenes(token, String(project.id));
  const parseTime = (value: unknown): number => {
    const m = String(value || "").match(/^(?:(\\d+):)?(\\d+(?:\\.\\d+)?)\\s*-\\s*(?:(\\d+):)?(\\d+(?:\\.\\d+)?)/);
    if (!m) return NaN;
    const toSec = (mm: string | undefined, sec: string | undefined) => Number(mm || 0) * 60 + Number(sec || 0);
    return toSec(m[3], m[4]);
  };
  const storyboardScenes = ss.map(s => {
    const parts = String(s.timestamp_range || "").split("-");
    const start = parseTime((parts[0] || "").trim() + " - " + (parts[0] || "").trim());
    const end = parseTime((parts[1] || "").trim() + " - " + (parts[1] || "").trim());
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Invalid storyboard timestamp for scene " + s.scene_number + ".");
    return {
      scene: Number(s.scene_number),
      startTime: start,
      endTime: end,
      duration_seconds: end - start,
      scene_title: s.scene_title,
      visual_description: s.visual_description,
      camera_direction: s.camera_direction,
      mood: s.mood,
      location: s.location,
      lyric_moment: s.lyric_moment,
    };
  });
  const data = await arena(token, "/v1/video/assemble", "assemble", {
    project_id: project.id, job_id: "render-" + project.id,
    audio_url: project.song_file,
    target_duration_seconds: Number(project.song_duration || 0),
    storyboard: { songDuration: Number(project.song_duration || 0), scenes: storyboardScenes },
    motion: { clips: clips.map(c => ({
      scene: Number(c.scene_number),
      video_url: c.clip_url,
      duration_seconds: Number(c.duration || 4),
      provider: "pixazo",
      model: "ltx-video",
      generation_type: "GENERATIVE_VIDEO",
      asset_id: "motion:" + String(c.id || c.scene_number),
    })) },
  });
  return data;
}

async function renderStatus(token: string, renderId: string, duration: number): Promise<any> {
  return await arena(token, "/v1/video/assemble/status/" + encodeURIComponent(renderId), "assembleStatus", { target_duration_seconds: duration }, "POST");
}

async function main(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const token = bearer(req);
  const uid = await userId(req);
  const body = await req.json().catch(() => ({}));
  const projectId = text(body?.project_id || body?.projectId);
  if (!projectId) throw new Error("project_id is required.");

  const project = await getProject(token, projectId, uid);
  const pipeline = await getPipeline(token, projectId);
  let state = pipeline.state;

  if (body?.reset === true) {
    state = { stage:"world_report", status:"idle", cursor:0, started_at:new Date().toISOString(), motion_job_id:null, render_id:null, error_code:null, error_message:null };
  }

  if (body?.duration_seconds && Number(body.duration_seconds) > 0 && !Number(project.song_duration || 0)) {
    await saveProject(token, projectId, { song_duration: Number(body.duration_seconds) });
    project.song_duration = Number(body.duration_seconds);
  }

  state.status = "running";
  state.updated_at = new Date().toISOString();

  try {
    if (state.stage === "world_report") {
      await stageWorld(token, project, uid);
      state.stage = "characters";
      state.cursor = 0;
    } else if (state.stage === "characters") {
      state.world = await readWorld(token, projectId);
      await stageCharacters(token, project, uid, state.world);
      state.stage = "style_bible";
    } else if (state.stage === "style_bible") {
      state.world = await readWorld(token, projectId);
      state.chars = await readChars(token, projectId);
      await stageStyle(token, project, uid, state.world, state.chars);
      state.stage = "sheets";
    } else if (state.stage === "sheets") {
      state.world = await readWorld(token, projectId);
      state.chars = await readChars(token, projectId);
      await stageSheets(token, project, uid, state.world, state.chars);
      state.stage = "storyboard";
    } else if (state.stage === "storyboard") {
      state.world = await readWorld(token, projectId);
      state.scene_count = await stageStoryboard(token, project, uid, state.world);
      state.cursor = 0;
      state.stage = "scene_prompts";
    } else if (state.stage === "scene_prompts") {
      state.scene_count = await stagePrompts(token, project, uid);
      state.cursor = 1;
      state.stage = "scene_images";
    } else if (state.stage === "scene_images") {
      const count = Number(state.scene_count || 0);
      const n = Number(state.cursor || 1);
      if (n > count) {
        state.cursor = 1;
        state.stage = "motion_start";
      } else {
        await stageImage(token, project, uid, n);
        state.cursor = n + 1;
      }
    } else if (state.stage === "motion_start") {
      state.motion_job_id = await startMotion(token, project);
      await saveProject(token, projectId, { status:"Generating Motion" });
      state.stage = "motion_poll";
    } else if (state.stage === "motion_poll") {
      const job = await motionStatus(token, String(state.motion_job_id));
      const status = String(job?.status || job?.result?.status || "").toLowerCase();
      if (status === "queued" || status === "running" || status === "waiting_provider_status") {
        state.last_provider_status = status;
      } else if (status === "completed" || status === "partial") {
        await saveMotionClips(token, project, uid, job);
        if (status === "partial") throw new Error("Motion completed partially. Inspect motion_clips before final render.");
        state.stage = "render_start";
      } else {
        state.last_provider_status = status || "unknown";
      }
    } else if (state.stage === "render_start") {
      const data = await startRender(token, project);
      state.render_id = String(data?.render_id || data?.id || data?.result?.render_id || "");
      if (!state.render_id) throw new Error("Shotstack assembly did not return a render ID.");
      state.stage = "render_poll";
      await saveProject(token, projectId, { status:"Preview Ready" });
    } else if (state.stage === "render_poll") {
      const data = await renderStatus(token, String(state.render_id), Number(project.song_duration || 0));
      const status = String(data?.status || data?.result?.status || "").toLowerCase();
      if (status === "done" || status === "completed" || status === "ready") {
        const url = data?.url || data?.video_url || data?.result?.url || data?.result?.video_url;
        if (!url) throw new Error("Shotstack reported completion without a video URL.");
        const existing = await db(token, "final_videos?select=id&project_id=eq." + encodeURIComponent(projectId) + "&limit=1");
        const row = { project_id:projectId, title:project.title, video_url:url, audio_file:project.song_file, duration:project.song_duration, format:"mp4", quality:"standard", render_status:"complete", downloadable:true };
        if(existing?.length) await db(token,"final_videos?id=eq."+existing[0].id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(row)});
        else await db(token,"final_videos",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(row)});
        await saveProject(token, projectId, { status:"Final Video Rendered" });
        state.stage = "completed";
        state.status = "completed";
      } else if (status === "failed" || status === "error") {
        throw new Error("Shotstack render failed: " + String(data?.error || data?.message || "provider error"));
      } else {
        state.last_provider_status = status || "processing";
      }
    } else if (state.stage === "completed") {
      state.status = "completed";
    } else {
      throw new Error("Unknown pipeline stage: " + String(state.stage));
    }

    if (state.stage !== "completed") state.status = "waiting";
    await savePipeline(token, projectId, uid, pipeline, state);
    return json({ success:true, project_id:projectId, status:state.status, stage:state.stage, cursor:state.cursor || 0, scene_count:state.scene_count || null, motion_job_id:state.motion_job_id || null, render_id:state.render_id || null, final_video_ready:state.stage === "completed" });
  } catch (error) {
    state.status = "failed";
    state.error_code = "PIPELINE_STAGE_FAILED";
    state.error_message = error instanceof Error ? error.message : String(error);
    await savePipeline(token, projectId, uid, pipeline, state);
    return json({ success:false, project_id:projectId, status:"failed", stage:state.stage, error:state.error_message }, 500);
  }
}

Deno.serve(async (req) => {
  try { return await main(req); }
  catch (error) { return json({ success:false, error:error instanceof Error ? error.message : String(error) }, 401); }
});
