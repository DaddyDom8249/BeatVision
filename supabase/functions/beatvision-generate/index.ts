const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL =
  "https://app-c7bfquxvq58h-api-VaOwP8E7dJqa.gateway.appmedo.com/v1beta/models/gemini-2.5-flash:generateContent";

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  console.log("[callGemini] Sending request to gateway, prompt length:", prompt.length);

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Gateway-Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 4096 },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const rawBody = await response.text();
  console.log("[callGemini] Gateway status:", response.status, "body length:", rawBody.length);

  if (!response.ok) {
    console.error("[callGemini] Gateway error body:", rawBody.slice(0, 500));
    throw new Error(`Gateway error ${response.status}: ${rawBody.slice(0, 200)}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody);
  } catch (e) {
    console.error("[callGemini] Failed to parse gateway response as JSON:", rawBody.slice(0, 300));
    throw new Error(`Failed to parse gateway response: ${e}`);
  }

  const text =
    (parsed as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
      ?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  console.log("[callGemini] Extracted text length:", text.length);
  return text;
}

function parseJsonFromText(text: string): Record<string, unknown> {
  // Try markdown code block first
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch { /* fall through */ }
  }
  // Try raw JSON object
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
  }
  // Try full text
  try { return JSON.parse(text.trim()); } catch { /* fall through */ }
  console.warn("[parseJsonFromText] Could not parse JSON, text snippet:", text.slice(0, 300));
  return {};
}

function parseJsonArrayFromText(text: string): unknown[] {
  // Try markdown code block first
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch { /* fall through */ }
  }
  // Try raw JSON array
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch { /* fall through */ }
  }
  console.warn("[parseJsonArrayFromText] Could not parse JSON array, text snippet:", text.slice(0, 300));
  return [];
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
  if (!apiKey) {
    console.error("[beatvision-generate] INTEGRATIONS_API_KEY is not set");
    return new Response(JSON.stringify({ error: "Server configuration error: missing API key" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (e) {
    console.error("[beatvision-generate] Failed to parse request body:", e);
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const action = (body.action as string) || "";
  const projectTitle = (body.projectTitle as string) || "";
  const lyrics = (body.lyrics as string) || "";
  const style = (body.style as string) || "Cinematic";
  const notes = (body.notes as string) || "";
  const regenerationSeed = (body.seed as number) || 1;

  console.log("[beatvision-generate] action:", action, "| project:", projectTitle, "| style:", style);

  try {
    // ── generate_world_report ─────────────────────────────────────────────────
    if (action === "generate_world_report") {
      const prompt = `You are BeatVision, an AI Music Director. Analyze this song and create a detailed Visual World Report.

Song Title: "${projectTitle}"
Visual Style: ${style}
Lyrics:
${lyrics}
${notes ? `Creator Notes: ${notes}` : ""}

${regenerationSeed > 1 ? `This is regeneration attempt ${regenerationSeed}. Create a DIFFERENT perspective from the previous one. Explore alternative themes, different visual metaphors, and a fresh emotional angle.` : ""}

Return ONLY a valid JSON object. No markdown, no code fences, no extra text. Use these exact field names:
{
  "song_summary": "2-3 sentence description of what this song is about",
  "emotional_core": "The primary emotion driving this song",
  "main_visual_world": "The primary visual world/setting for this music video (2-3 sentences, vivid and specific)",
  "color_palette": "5-7 specific named colors that define this world",
  "lighting_style": "Description of the lighting approach",
  "main_characters": "Description of the main character(s) in this visual world",
  "symbolic_objects": "3-5 symbolic objects or visual motifs that represent the song's themes",
  "key_locations": "3-4 key locations or scenes where the story unfolds",
  "story_direction": "The narrative arc of the music video (beginning, middle, end)",
  "creative_match_score": 88
}

Replace the placeholder values with content specific to THIS song. For creative_match_score output a number between 75 and 98 with no quotes.`;

      const text = await callGemini(prompt, apiKey);
      const data = parseJsonFromText(text);

      if (!data.song_summary && !data.emotional_core) {
        console.error("[generate_world_report] Parsed data appears empty. Raw text:", text.slice(0, 500));
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── generate_storyboard ───────────────────────────────────────────────────
    if (action === "generate_storyboard") {
      const worldReport = (body.worldReport as Record<string, string>) || {};
      const sceneCount = 7;

      const prompt = `You are BeatVision, an AI Music Director. Create a cinematic storyboard for this music video.

Song Title: "${projectTitle}"
Visual Style: ${style}
Lyrics:
${lyrics}
${notes ? `Creator Notes: ${notes}` : ""}

Visual World Context:
- Main World: ${worldReport.main_visual_world || ""}
- Emotional Core: ${worldReport.emotional_core || ""}
- Color Palette: ${worldReport.color_palette || ""}
- Story Direction: ${worldReport.story_direction || ""}

Generate exactly ${sceneCount} storyboard scenes. Return ONLY a valid JSON array. No markdown, no code fences, no extra text:
[
  {
    "scene_number": 1,
    "timestamp_range": "0:00 - 0:26",
    "scene_title": "Evocative scene title",
    "visual_description": "Detailed visual description of what we see (2-3 sentences)",
    "camera_direction": "Specific camera movement and framing",
    "mood": "The emotional mood of this scene",
    "location": "Specific location for this scene",
    "lyric_moment": "A specific lyric line or phrase that anchors this scene",
    "transition_style": "How this scene transitions to the next"
  }
]

Space timestamps across a 3-4 minute song. Make each scene part of a cohesive cinematic narrative.`;

      const text = await callGemini(prompt, apiKey);
      const scenes = parseJsonArrayFromText(text);

      return new Response(JSON.stringify({ success: true, data: scenes }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── refresh_scene ─────────────────────────────────────────────────────────
    if (action === "refresh_scene") {
      const sceneNumber = (body.sceneNumber as number) || 1;
      const existingScene = (body.existingScene as Record<string, unknown>) || {};
      const worldReport = (body.worldReport as Record<string, string>) || {};
      const refreshSeed = (body.seed as number) || 1;

      const prompt = `You are BeatVision, an AI Music Director. Refresh scene ${sceneNumber} of this music video storyboard.

Song Title: "${projectTitle}"
Visual Style: ${style}
Lyrics (excerpt): ${lyrics.slice(0, 500)}
${notes ? `Creator Notes: ${notes}` : ""}

Visual World: ${worldReport.main_visual_world || ""}
Emotional Core: ${worldReport.emotional_core || ""}

Current scene to replace:
- Title: ${existingScene.scene_title}
- Location: ${existingScene.location}
- Mood: ${existingScene.mood}

Create a DIFFERENT version of scene ${sceneNumber}. Different location, different visual approach, different camera work. Variation seed: ${refreshSeed}.

Return ONLY a valid JSON object. No markdown, no code fences, no extra text:
{
  "scene_number": ${sceneNumber},
  "timestamp_range": "${existingScene.timestamp_range || `${(sceneNumber - 1) * 25}s - ${sceneNumber * 25}s`}",
  "scene_title": "A fresh, evocative scene title",
  "visual_description": "Completely different visual description (2-3 sentences)",
  "camera_direction": "New camera movement and framing",
  "mood": "The emotional mood",
  "location": "A different location from the original",
  "lyric_moment": "A specific lyric line for this scene",
  "transition_style": "Transition style to next scene"
}`;

      const text = await callGemini(prompt, apiKey);
      const data = parseJsonFromText(text);

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── generate_characters ───────────────────────────────────────────────────
    if (action === "generate_characters") {
      const worldReport = (body.worldReport as Record<string, string>) || {};
      const regenerationSeedC = (body.seed as number) || 1;

      const prompt = `You are BeatVision, an AI Music Director. Define the characters and environment for this music video world.

Song Title: "${projectTitle}"
Visual Style: ${style}
Lyrics:
${lyrics}
${notes ? `Creator Notes: ${notes}` : ""}

Visual World: ${worldReport.main_visual_world || ""}
Emotional Core: ${worldReport.emotional_core || ""}
Color Palette: ${worldReport.color_palette || ""}
Main Characters from World: ${worldReport.main_characters || ""}

${regenerationSeedC > 1 ? `Regeneration ${regenerationSeedC}: Create a DIFFERENT character and environment interpretation.` : ""}

Return ONLY a valid JSON object. No markdown, no code fences, no extra text:
{
  "main_character": "Detailed description of the main character: appearance, personality, emotional state, and role in the story (3-4 sentences)",
  "supporting_character": "Description of any supporting characters or presences in this world (2-3 sentences)",
  "main_environment": "Detailed description of the primary environment/world (3-4 sentences)",
  "visual_atmosphere": "The overall visual atmosphere and tone: light quality, texture, time of day, weather (2-3 sentences)",
  "wardrobe_style": "Clothing and visual style for the characters: colors, textures, symbolic elements (2-3 sentences)",
  "world_rules": "3-5 rules or defining characteristics of this world that make it unique"
}`;

      const text = await callGemini(prompt, apiKey);
      const data = parseJsonFromText(text);

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── generate_style_bible ──────────────────────────────────────────────────
    if (action === "generate_style_bible") {
      const worldReport = (body.worldReport as Record<string, string>) || {};
      const charEnv = (body.charEnv as Record<string, string>) || {};
      const seed = (body.seed as number) || 1;

      const prompt = `You are BeatVision, an AI Music Director. Create a World Style Bible for a music video production.

Song Title: "${projectTitle}"
Visual Style: ${style}
Lyrics:
${lyrics}
${notes ? `Creator Notes: ${notes}` : ""}

Approved Visual World:
- Main World: ${worldReport.main_visual_world || ""}
- Emotional Core: ${worldReport.emotional_core || ""}
- Color Palette: ${worldReport.color_palette || ""}
- Lighting Style: ${worldReport.lighting_style || ""}
- Story Direction: ${worldReport.story_direction || ""}

Characters and Environment:
- Main Character: ${charEnv.main_character || ""}
- Main Environment: ${charEnv.main_environment || ""}
- Visual Atmosphere: ${charEnv.visual_atmosphere || ""}
- Wardrobe: ${charEnv.wardrobe_style || ""}
- World Rules: ${charEnv.world_rules || ""}

${seed > 1 ? `Regeneration ${seed}: Create a DIFFERENT style bible interpretation. Explore alternative rules and motifs.` : ""}

This style bible will be used to keep ALL generated images and video scenes visually consistent. Make every rule specific and actionable for a visual artist or AI image generator.

Return ONLY a valid JSON object. No markdown, no code fences, no extra text:
{
  "overall_visual_style": "2-3 sentence description of the overall visual style, tone, and cinematic feel of this music video world",
  "color_rules": "Specific color rules: primary palette, accent colors, colors to avoid, how colors shift across the video",
  "lighting_rules": "Lighting rules: key light sources, shadow depth, contrast level, time of day rules, special lighting moments",
  "camera_rules": "Camera rules: preferred shot types, movement styles, focal lengths, aspect ratio feel, pace of cuts",
  "character_consistency_rules": "Rules for keeping characters visually consistent: specific appearance details that must not change",
  "environment_rules": "Rules for environments: recurring textures, spatial rules, what makes each location feel part of the same world",
  "symbolic_motifs": "3-5 recurring symbolic objects or visual elements that appear throughout the video and what they mean",
  "things_to_avoid": "Specific visual elements, styles, or directions that must NOT appear in this world"
}`;

      const text = await callGemini(prompt, apiKey);
      const data = parseJsonFromText(text);
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── generate_character_sheet ──────────────────────────────────────────────
    if (action === "generate_character_sheet") {
      const worldReport = (body.worldReport as Record<string, string>) || {};
      const charEnv = (body.charEnv as Record<string, string>) || {};
      const seed = (body.seed as number) || 1;

      const prompt = `You are BeatVision, an AI Music Director. Create a detailed Character Sheet for this music video.

Song Title: "${projectTitle}"
Visual Style: ${style}
Lyrics:
${lyrics}
${notes ? `Creator Notes: ${notes}` : ""}

Character Context:
- Main Character (from world): ${charEnv.main_character || worldReport.main_characters || ""}
- Supporting Character: ${charEnv.supporting_character || ""}
- Wardrobe Style: ${charEnv.wardrobe_style || ""}
- Emotional Core of Song: ${worldReport.emotional_core || ""}
- Visual Atmosphere: ${charEnv.visual_atmosphere || ""}

${seed > 1 ? `Regeneration ${seed}: Create a DIFFERENT character sheet interpretation. Different visual traits and energy.` : ""}

This character sheet will be used to keep the main character visually consistent across ALL generated images and video frames.

Return ONLY a valid JSON object. No markdown, no code fences, no extra text:
{
  "character_role": "The role of this character in the music video story (e.g., 'The Protagonist', 'The Dreamer', 'The Grieving Artist')",
  "appearance": "Highly specific physical description: face, hair, skin, eyes, build, height, age range - everything needed to recreate this person consistently",
  "wardrobe": "Specific clothing description: every garment, color, fabric, fit, condition, accessories, shoes - everything visible",
  "body_language": "How this character carries themselves: posture, gestures, movement style, energy level, way they occupy space",
  "facial_expression": "Primary and secondary facial expressions in this video: what emotion lives on their face, what changes",
  "personality_energy": "The character's energy and personality as expressed visually: what a camera would capture about who they are",
  "recurring_visual_traits": "3-4 specific visual details that ALWAYS appear with this character and make them instantly recognizable",
  "consistency_notes": "Critical rules for keeping this character consistent: what must never change, what subtle variations are allowed"
}`;

      const text = await callGemini(prompt, apiKey);
      const data = parseJsonFromText(text);
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── generate_environment_sheet ────────────────────────────────────────────
    if (action === "generate_environment_sheet") {
      const worldReport = (body.worldReport as Record<string, string>) || {};
      const charEnv = (body.charEnv as Record<string, string>) || {};
      const seed = (body.seed as number) || 1;

      const prompt = `You are BeatVision, an AI Music Director. Create a detailed Environment Sheet for this music video world.

Song Title: "${projectTitle}"
Visual Style: ${style}
Lyrics:
${lyrics}
${notes ? `Creator Notes: ${notes}` : ""}

World Context:
- Main Visual World: ${worldReport.main_visual_world || ""}
- Key Locations: ${worldReport.key_locations || ""}
- Color Palette: ${worldReport.color_palette || ""}
- Lighting Style: ${worldReport.lighting_style || ""}
- Main Environment: ${charEnv.main_environment || ""}
- Visual Atmosphere: ${charEnv.visual_atmosphere || ""}
- World Rules: ${charEnv.world_rules || ""}

${seed > 1 ? `Regeneration ${seed}: Create a DIFFERENT environment sheet. Emphasize different details and locations.` : ""}

This environment sheet will be used to keep ALL locations and settings in this music video visually consistent.

Return ONLY a valid JSON object. No markdown, no code fences, no extra text:
{
  "main_world_description": "3-4 sentences describing the primary world of this music video: what kind of place it is, what era, what feeling",
  "key_locations": "Describe each of the 3-4 key locations in detail: what they look like, what they feel like, what happens there",
  "weather_atmosphere": "The weather, sky, and atmospheric conditions of this world: time of day, weather states, air quality, seasonal feel",
  "textures_materials": "Dominant textures and materials in this world: surfaces, ground, walls, objects - specific and visual",
  "background_details": "What lives in the background of every frame: crowds, emptiness, decay, nature, architecture",
  "lighting_conditions": "Natural and artificial light sources in each location: direction, color temperature, intensity, shadows",
  "recurring_objects": "Objects, props, or elements that appear repeatedly across locations and tie the world together",
  "world_consistency_rules": "3-5 rules that ensure every location feels like it belongs to the same world"
}`;

      const text = await callGemini(prompt, apiKey);
      const data = parseJsonFromText(text);
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── generate_scene_prompts ────────────────────────────────────────────────
    if (action === "generate_scene_prompts") {
      const scenes = (body.scenes as Record<string, unknown>[]) || [];
      const worldReport = (body.worldReport as Record<string, string>) || {};
      const styleBible = (body.styleBible as Record<string, string>) || {};
      const characterSheet = (body.characterSheet as Record<string, string>) || {};
      const environmentSheet = (body.environmentSheet as Record<string, string>) || {};

      const prompt = `You are BeatVision, an AI Music Director. Create visual prompt packages for each storyboard scene.

Song Title: "${projectTitle}"
Visual Style: ${style}
${notes ? `Creator Notes: ${notes}` : ""}

Style Bible Summary:
- Overall Style: ${styleBible.overall_visual_style || ""}
- Color Rules: ${styleBible.color_rules || ""}
- Camera Rules: ${styleBible.camera_rules || ""}
- Things to Avoid: ${styleBible.things_to_avoid || ""}

Character: ${characterSheet.character_role || ""} — ${characterSheet.appearance || ""}

World: ${worldReport.main_visual_world || ""} — ${environmentSheet.main_world_description || ""}

Storyboard Scenes:
${scenes.map((s, i) => `Scene ${s.scene_number || i + 1}: "${s.scene_title}" | Location: ${s.location} | Mood: ${s.mood} | Camera: ${s.camera_direction} | Lyric: "${s.lyric_moment}"`).join("\n")}

For EACH scene, create a detailed visual prompt package that an AI image generator can use directly.

Return ONLY a valid JSON array. No markdown, no code fences, no extra text:
[
  {
    "scene_number": 1,
    "scene_title": "exact scene title from storyboard",
    "timestamp_range": "exact timestamp from storyboard",
    "main_image_prompt": "A detailed, specific positive prompt for AI image generation (60-100 words): describe exactly what we see, character appearance, environment, lighting, camera angle, mood, art style",
    "camera_framing": "Specific framing instruction: shot type, angle, focal length feel",
    "lighting_direction": "Specific lighting: key light direction, color temperature, shadow depth, any practical lights visible",
    "character_placement": "Where the character is in frame, what they are doing, their pose and expression",
    "mood": "The emotional mood this frame must convey",
    "environment_details": "Background and environment specifics for this exact scene",
    "symbolic_objects": "Any symbolic objects that must appear in this frame",
    "style_consistency_notes": "2-3 notes ensuring this frame matches the style bible",
    "negative_prompt": "Specific elements to exclude from AI generation: wrong styles, wrong objects, wrong moods"
  }
]`;

      const text = await callGemini(prompt, apiKey);
      const data = parseJsonArrayFromText(text);
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── refresh_scene_prompt ──────────────────────────────────────────────────
    if (action === "refresh_scene_prompt") {
      const scenePrompt = (body.scenePrompt as Record<string, unknown>) || {};
      const worldReport = (body.worldReport as Record<string, string>) || {};
      const styleBible = (body.styleBible as Record<string, string>) || {};
      const seed = (body.seed as number) || 1;

      const prompt = `You are BeatVision, an AI Music Director. Regenerate the visual prompt for a single storyboard scene.

Song Title: "${projectTitle}"
Visual Style: ${style}
Variation Seed: ${seed}

Style Bible:
- Overall Style: ${styleBible.overall_visual_style || ""}
- Color Rules: ${styleBible.color_rules || ""}
- Camera Rules: ${styleBible.camera_rules || ""}
- Things to Avoid: ${styleBible.things_to_avoid || ""}

Current Scene:
- Scene ${scenePrompt.scene_number}: "${scenePrompt.scene_title}"
- Timestamp: ${scenePrompt.timestamp_range}
- Current Prompt: ${scenePrompt.main_image_prompt}
- Current Mood: ${scenePrompt.mood}
- World: ${worldReport.main_visual_world || ""}

Create a DIFFERENT visual prompt for this scene. Different visual composition, different emphasis, different approach — but still consistent with the style bible. The main_image_prompt must visibly change.

Return ONLY a valid JSON object. No markdown, no code fences, no extra text:
{
  "scene_number": ${scenePrompt.scene_number},
  "scene_title": "${scenePrompt.scene_title}",
  "timestamp_range": "${scenePrompt.timestamp_range}",
  "main_image_prompt": "New detailed positive prompt (60-100 words) with a fresh visual approach",
  "camera_framing": "New camera framing for this scene",
  "lighting_direction": "New lighting direction",
  "character_placement": "New character placement and pose",
  "mood": "Mood for this scene",
  "environment_details": "Updated environment details",
  "symbolic_objects": "Symbolic objects for this scene",
  "style_consistency_notes": "2-3 style consistency notes",
  "negative_prompt": "Updated negative prompt"
}`;

      const text = await callGemini(prompt, apiKey);
      const data = parseJsonFromText(text);
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── generate_scene_previews ───────────────────────────────────────────────
    if (action === "generate_scene_previews") {
      const scenePrompts = (body.scenePrompts as Record<string, unknown>[]) || [];
      const worldReport = (body.worldReport as Record<string, string>) || {};

      const prompt = `You are BeatVision, an AI Music Director. Create cinematic preview card descriptions for each scene.

Song Title: "${projectTitle}"
Visual Style: ${style}
World: ${worldReport.main_visual_world || ""}
Color Palette: ${worldReport.color_palette || ""}

Scene Prompts:
${scenePrompts.map((s) => `Scene ${s.scene_number}: "${s.scene_title}" | Mood: ${s.mood} | Environment: ${s.environment_details} | Camera: ${s.camera_framing}`).join("\n")}

For each scene, create a cinematic preview card — a rich visual description that brings the scene to life as a single frame.

Return ONLY a valid JSON array. No markdown, no code fences, no extra text:
[
  {
    "scene_number": 1,
    "preview_title": "Short poetic title for this preview card (4-6 words)",
    "preview_description": "2-3 sentence vivid description of this frame as if describing a movie still — what the viewer sees, feels, and notices",
    "dominant_colors": "3-4 dominant colors visible in this frame as hex codes or descriptive names",
    "mood": "Single word or short phrase capturing the emotional mood",
    "location": "Specific location name for this scene",
    "symbolic_object": "The most important symbolic object in this frame",
    "camera_direction": "Camera framing and movement for this frame",
    "placeholder_visual": "A one-sentence art direction note describing what an artist should draw or paint for this frame"
  }
]`;

      const text = await callGemini(prompt, apiKey);
      const data = parseJsonArrayFromText(text);
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── generate_scene_image_prompt / generate_all_scene_image_prompts ────────
    if (action === "generate_scene_image_prompt" || action === "generate_all_scene_image_prompts") {
      const isBatch = action === "generate_all_scene_image_prompts";
      const scenePrompts: Record<string, unknown>[] = isBatch
        ? ((body.scenePrompts as Record<string, unknown>[]) || [])
        : [(body.scenePrompt as Record<string, unknown>) || {}];

      const styleBible = (body.styleBible as Record<string, string>) || {};
      const characterSheet = (body.characterSheet as Record<string, string>) || {};
      const envSheet = (body.envSheet as Record<string, string>) || {};
      const consistency = (body.consistency as Record<string, boolean>) || {};
      const seed = (body.seed as number) || 1;

      const consistencyInstructions = [
        consistency.character !== false
          ? `CHARACTER LOCK: ${characterSheet.appearance || ""}. Wardrobe: ${characterSheet.wardrobe || ""}. Recurring traits: ${characterSheet.recurring_visual_traits || ""}.`
          : "",
        consistency.environment !== false
          ? `ENVIRONMENT LOCK: ${envSheet.main_world_description || ""}. Atmosphere: ${envSheet.weather_atmosphere || ""}. Lighting: ${envSheet.lighting_conditions || ""}.`
          : "",
        consistency.style !== false
          ? `STYLE LOCK: ${styleBible.overall_visual_style || ""}. Color rules: ${styleBible.color_rules || ""}. Camera rules: ${styleBible.camera_rules || ""}.`
          : "",
        consistency.storyboard !== false ? "Keep composition close to the storyboard direction." : "",
        consistency.allowVariation ? "Allow slight creative variation in framing and composition." : "",
      ].filter(Boolean).join(" ");

      const buildSceneImageData = async (sp: Record<string, unknown>, index: number): Promise<Record<string, unknown>> => {
        const sceneNum = (sp.scene_number as number) || index + 1;
        const sceneTitle = (sp.scene_title as string) || `Scene ${sceneNum}`;

        const fullPrompt = [
          sp.main_image_prompt,
          sp.camera_framing ? `Camera: ${sp.camera_framing}` : "",
          sp.lighting_direction ? `Lighting: ${sp.lighting_direction}` : "",
          sp.character_placement ? `Character: ${sp.character_placement}` : "",
          sp.environment_details ? `Environment: ${sp.environment_details}` : "",
          sp.symbolic_objects ? `Symbols: ${sp.symbolic_objects}` : "",
          sp.style_consistency_notes ? `Style: ${sp.style_consistency_notes}` : "",
          consistencyInstructions,
        ].filter(Boolean).join(". ");

        const negativePrompt = (sp.negative_prompt as string) || styleBible.things_to_avoid || "";

        const llmPrompt = `You are BeatVision, an AI Music Director. Create a cinematic placeholder visual descriptor for a scene image that will render as a rich visual card when no image generation API is connected.

Song: "${projectTitle}"
Style: ${style}
Scene ${sceneNum}: "${sceneTitle}"
${seed > 1 ? `Variation seed: ${seed} — produce a DIFFERENT visual take from any previous versions.` : ""}

Full image generation prompt:
${fullPrompt}

Negative prompt (things to avoid):
${negativePrompt}

Return ONLY valid JSON, no markdown:
{
  "prompt_summary": "20-30 word description of this scene's visual for the creator to read",
  "placeholder_description": "2-3 vivid sentences describing exactly what this generated image would look like — specific colors, composition, lighting, character pose, environment details",
  "placeholder_gradient_start": "#hexcolor dominating the left/top (based on palette and mood)",
  "placeholder_gradient_end": "#hexcolor dominating the right/bottom",
  "placeholder_accent": "#hexcolor for a highlight/accent element",
  "placeholder_label_1": "Short label for dominant visual element (5-8 words)",
  "placeholder_label_2": "Short mood/atmosphere label (3-5 words)",
  "character_presence": "Who is in this scene and where (1 sentence)",
  "location": "The specific location name or description",
  "style_consistency_summary": "One sentence confirming which style rules this scene follows"
}`;

        const text = await callGemini(llmPrompt, apiKey);
        const parsed = parseJsonFromText(text);

        return {
          scene_number: sceneNum,
          scene_title: sceneTitle,
          timestamp_range: (sp.timestamp_range as string) || null,
          mood: (sp.mood as string) || null,
          camera_framing: (sp.camera_framing as string) || null,
          location: (parsed.location as string) || null,
          character_presence: (parsed.character_presence as string) || (characterSheet.character_role as string) || null,
          lighting_direction: (sp.lighting_direction as string) || null,
          prompt_used: fullPrompt,
          prompt_summary: (parsed.prompt_summary as string) || `Scene ${sceneNum}: ${sceneTitle}`,
          style_consistency_summary: (parsed.style_consistency_summary as string) || null,
          // Placeholder visual data for mock card rendering
          placeholder_description: (parsed.placeholder_description as string) || null,
          placeholder_gradient_start: (parsed.placeholder_gradient_start as string) || "#1a1a2e",
          placeholder_gradient_end: (parsed.placeholder_gradient_end as string) || "#0d0d0d",
          placeholder_accent: (parsed.placeholder_accent as string) || "#3b7eff",
          placeholder_label_1: (parsed.placeholder_label_1 as string) || sceneTitle,
          placeholder_label_2: (parsed.placeholder_label_2 as string) || (sp.mood as string) || "",
          // image_url null = placeholder mode; set to real URL when API is connected
          image_url: null,
        };
      };

      if (isBatch) {
        const results = await Promise.allSettled(
          scenePrompts.map((sp, i) => buildSceneImageData(sp, i))
        );
        const data = results.map((r, i) =>
          r.status === "fulfilled"
            ? r.value
            : {
                scene_number: (scenePrompts[i]?.scene_number as number) || i + 1,
                scene_title: (scenePrompts[i]?.scene_title as string) || `Scene ${i + 1}`,
                error: r.reason instanceof Error ? r.reason.message : "Generation failed",
                image_url: null,
                placeholder_gradient_start: "#1a1a2e",
                placeholder_gradient_end: "#0d0d0d",
                placeholder_accent: "#3b7eff",
              }
        );
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        const data = await buildSceneImageData(scenePrompts[0], 0);
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.warn("[beatvision-generate] Unknown action:", action);
    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[beatvision-generate] Unhandled error for action", action, ":", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
