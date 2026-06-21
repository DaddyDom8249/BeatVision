import { supabase } from '@/db/supabase';
import type {
  Project,
  VisualWorldReport,
  StoryboardScene,
  CharacterEnvironment,
  WorldStyleBible,
  CharacterSheet,
  EnvironmentSheet,
  SceneVisualPrompt,
  ScenePreview,
} from '@/types/types';

interface LocalWorldAssetsArgs {
  project: Project;
  worldReport: VisualWorldReport | null;
  scenes: StoryboardScene[];
  charEnv: CharacterEnvironment | null;
}

interface LocalWorldAssetsResult {
  bible: WorldStyleBible | null;
  charSheet: CharacterSheet | null;
  envSheet: EnvironmentSheet | null;
  prompts: SceneVisualPrompt[];
  previews: ScenePreview[];
}

const cleanText = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
};

export async function createLocalWorldAssets({
  project,
  worldReport,
  scenes,
  charEnv,
}: LocalWorldAssetsArgs): Promise<LocalWorldAssetsResult> {
  const now = new Date().toISOString();

  const title = cleanText(project.title, 'Untitled Song');
  const style = cleanText(project.selected_style, 'cinematic');
  const worldDescription = cleanText(
    worldReport?.main_visual_world || charEnv?.main_environment,
    `A ${style} visual world built around the song, its emotional pressure, and the approved storyboard.`
  );
  const emotionalCore = cleanText(
    worldReport?.emotional_core,
    'pressure, survival, transformation, conflict, and release'
  );
  const colorPalette = cleanText(
    worldReport?.color_palette,
    'deep black, steel gray, muted amber, electric blue highlights, smoke, worn textures'
  );
  const lightingStyle = cleanText(
    worldReport?.lighting_style,
    'cinematic low-key lighting, rim light, practical glow, haze, hard contrast'
  );
  const storyDirection = cleanText(
    worldReport?.story_direction,
    'Begin inside pressure, reveal the world, escalate conflict, then end with a clear transformation.'
  );
  const mainCharacter = cleanText(
    charEnv?.main_character,
    'A central protagonist shaped by the emotional weight of the song.'
  );
  const supportingCharacter = cleanText(
    charEnv?.supporting_character,
    'A secondary presence, memory, shadow, environment, or opposing force.'
  );
  const wardrobe = cleanText(
    charEnv?.wardrobe_style,
    'Grounded, practical, cinematic wardrobe that stays consistent across scenes.'
  );

  const symbolicObjects = 'light, shadow, metal, roads, doors, smoke, reflections, sparks, wires';
  const keyLocations = 'primary performance space, symbolic interior, conflict location, final transformation space';

  await Promise.all([
    supabase.from('world_style_bibles').delete().eq('project_id', project.id),
    supabase.from('character_sheets').delete().eq('project_id', project.id),
    supabase.from('environment_sheets').delete().eq('project_id', project.id),
    supabase.from('scene_visual_prompts').delete().eq('project_id', project.id),
    supabase.from('scene_previews').delete().eq('project_id', project.id),
  ]);

  const { data: savedBible, error: bibleErr } = await supabase
    .from('world_style_bibles')
    .insert({
      project_id: project.id,
      overall_visual_style: `${style} music-video realism with symbolic cinematic composition. The world should feel intentional, grounded, and emotionally matched to "${title}".`,
      color_rules: colorPalette,
      lighting_rules: lightingStyle,
      camera_rules: 'Use readable frames, slow push-ins, texture closeups, wide establishing reveals, and motivated camera movement tied to the song energy.',
      character_consistency_rules: 'Keep the protagonist visually consistent across scenes: same silhouette, wardrobe family, emotional posture, and symbolic relationship to the world.',
      environment_rules: worldDescription,
      symbolic_motifs: symbolicObjects,
      things_to_avoid: 'Avoid random unrelated locations, stock-photo looks, inconsistent protagonist design, and visuals that ignore the approved storyboard.',
      approved: false,
      updated_at: now,
    })
    .select()
    .maybeSingle();

  if (bibleErr) throw bibleErr;

  const { data: savedCharSheet, error: charErr } = await supabase
    .from('character_sheets')
    .insert({
      project_id: project.id,
      character_role: 'Central protagonist of the music video world.',
      appearance: mainCharacter,
      wardrobe,
      body_language: 'Weighted, deliberate, emotionally readable movement that evolves with the song.',
      facial_expression: 'Subtle, intense, restrained emotion.',
      personality_energy: emotionalCore,
      recurring_visual_traits: 'Consistent silhouette, repeated symbolic framing, recurring object interactions, and clear relationship to the environment.',
      consistency_notes: 'The protagonist must remain recognizable across every scene.',
      approved: false,
      updated_at: now,
    })
    .select()
    .maybeSingle();

  if (charErr) throw charErr;

  const { data: savedEnvSheet, error: envErr } = await supabase
    .from('environment_sheets')
    .insert({
      project_id: project.id,
      main_world_description: worldDescription,
      key_locations: keyLocations,
      weather_atmosphere: 'Atmospheric haze, pressure in the air, and weather or lighting used as emotional texture.',
      textures_materials: 'Worn metal, rough surfaces, glass reflections, smoke, dust, wet ground, practical objects, and tactile cinematic detail.',
      background_details: 'Backgrounds should support the story instead of becoming random decoration.',
      lighting_conditions: lightingStyle,
      recurring_objects: symbolicObjects,
      world_consistency_rules: storyDirection,
      approved: false,
      updated_at: now,
    })
    .select()
    .maybeSingle();

  if (envErr) throw envErr;

  let sourceScenes = scenes;

  if (!sourceScenes.length) {
    const { data: fetchedScenes, error: scenesErr } = await supabase
      .from('storyboard_scenes')
      .select('*')
      .eq('project_id', project.id)
      .order('scene_number', { ascending: true });

    if (scenesErr) {
      console.warn('[BeatVision] Fallback could not fetch storyboard scenes:', scenesErr);
    }

    sourceScenes = Array.isArray(fetchedScenes) ? fetchedScenes as StoryboardScene[] : [];
  }

  if (!sourceScenes.length) {
    sourceScenes = [{
      id: '',
      project_id: project.id,
      scene_number: 1,
      scene_title: 'Core Visual Frame',
      timestamp_range: null,
      lyric_moment: '',
      visual_description: worldDescription,
      location: keyLocations,
      mood: emotionalCore,
      camera_direction: 'cinematic establishing frame',
      created_at: now,
      updated_at: now,
    } as unknown as StoryboardScene];
  }

  const promptRows = sourceScenes.map((scene, index) => {
    const sceneNumber = scene.scene_number || index + 1;
    const sceneTitle = cleanText(scene.scene_title, `Scene ${sceneNumber}`);
    const sceneMood = cleanText(scene.mood, emotionalCore);
    const sceneLocation = cleanText(scene.location, keyLocations);
    const cameraDirection = cleanText(scene.camera_direction, 'cinematic motivated camera movement');
    const lyricMoment = cleanText(scene.lyric_moment, '');

    return {
      project_id: project.id,
      storyboard_scene_id: scene.id || null,
      scene_number: sceneNumber,
      scene_title: sceneTitle,
      timestamp_range: scene.timestamp_range || null,
      main_image_prompt: [
        'Cinematic music video still.',
        `Project: "${title}".`,
        `Visual style: ${style}.`,
        `Scene: ${sceneTitle}.`,
        lyricMoment ? `Lyric moment: ${lyricMoment}.` : '',
        `World: ${worldDescription}.`,
        `Protagonist: ${mainCharacter}.`,
        `Supporting force: ${supportingCharacter}.`,
        `Mood: ${sceneMood}.`,
        `Location: ${sceneLocation}.`,
        `Lighting: ${lightingStyle}.`,
        `Symbols: ${symbolicObjects}.`,
        'Make the image feel like a deliberate frame from the approved storyboard, not a random poster.',
      ].filter(Boolean).join(' '),
      camera_framing: cameraDirection,
      lighting_direction: lightingStyle,
      character_placement: 'Place the protagonist clearly inside the scene action, readable in silhouette, posture, and relationship to the environment.',
      mood: sceneMood,
      environment_details: sceneLocation,
      symbolic_objects: symbolicObjects,
      style_consistency_notes: 'Match the approved world style bible, character sheet, environment sheet, and storyboard scene direction.',
      negative_prompt: 'random unrelated location, stock photo, inconsistent character, blurry face, unreadable composition, empty background',
      approved: false,
      preview_generated: false,
      updated_at: now,
    };
  });

  let savedPrompts: SceneVisualPrompt[] = [];

  if (promptRows.length > 0) {
    const { data: savedPromptsRaw, error: promptsErr } = await supabase
      .from('scene_visual_prompts')
      .insert(promptRows)
      .select();

    if (promptsErr) throw promptsErr;

    savedPrompts = (Array.isArray(savedPromptsRaw) ? savedPromptsRaw : []) as SceneVisualPrompt[];
  }

  let savedPreviews: ScenePreview[] = [];

  if (savedPrompts.length > 0) {
    const previewRows = savedPrompts.map((prompt) => ({
      project_id: project.id,
      scene_visual_prompt_id: prompt.id,
      preview_title: prompt.scene_title || `Scene ${prompt.scene_number} Preview`,
      preview_description: prompt.main_image_prompt,
      dominant_colors: colorPalette,
      mood: prompt.mood,
      location: prompt.environment_details,
      symbolic_object: prompt.symbolic_objects,
      camera_direction: prompt.camera_framing,
      placeholder_visual: `Preview card for ${prompt.scene_title || `Scene ${prompt.scene_number}`}`,
      image_url: null,
      approved: false,
    }));

    const { data: savedPreviewsRaw, error: previewErr } = await supabase
      .from('scene_previews')
      .insert(previewRows)
      .select();

    if (previewErr) throw previewErr;

    savedPreviews = (Array.isArray(savedPreviewsRaw) ? savedPreviewsRaw : []) as ScenePreview[];
  }

  await supabase
    .from('projects')
    .update({ status: 'World Assets In Review', updated_at: now })
    .eq('id', project.id);

  return {
    bible: savedBible as WorldStyleBible | null,
    charSheet: savedCharSheet as CharacterSheet | null,
    envSheet: savedEnvSheet as EnvironmentSheet | null,
    prompts: savedPrompts,
    previews: savedPreviews,
  };
}

export async function createLocalScenePromptsOnly({
  project,
  worldReport,
  scenes,
  styleBible,
  characterSheet,
  envSheet,
}: {
  project: Project;
  worldReport: VisualWorldReport | null;
  scenes: StoryboardScene[];
  styleBible: WorldStyleBible | null;
  characterSheet: CharacterSheet | null;
  envSheet: EnvironmentSheet | null;
}): Promise<SceneVisualPrompt[]> {
  if (!project?.id) {
    throw new Error('Cannot repair scene prompts without a project id.');
  }

  const safeSlice = (value: unknown, fallback: string, max = 900): string => {
    return cleanText(value, fallback).slice(0, max);
  };

  const getSceneTitle = (scene: Partial<StoryboardScene>, index: number): string => {
    return cleanText(scene.scene_title, `Scene ${index + 1}`);
  };

  const getSceneTime = (scene: Partial<StoryboardScene>, index: number): string => {
    return cleanText(scene.timestamp_range, `${index * 15}s-${(index + 1) * 15}s`);
  };

  const insertMany = async <T,>(table: string, payload: Record<string, unknown>[]): Promise<T[]> => {
    if (!payload.length) return [];

    let currentPayload = payload.map((row) => ({ ...row }));
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const { data, error } = await supabase
        .from(table)
        .insert(currentPayload)
        .select();

      if (!error) {
        return (Array.isArray(data) ? data : []) as T[];
      }

      lastError = error;

      const message = error.message || '';
      const missingColumn = message.match(/'([^']+)' column/)?.[1];

      if (error.code === 'PGRST204' && missingColumn) {
        console.warn(`[BeatVision] Removing unsupported ${table} column "${missingColumn}" and retrying insert.`);
        currentPayload = currentPayload.map((row) => {
          const next = { ...row };
          delete next[missingColumn];
          return next;
        });
        continue;
      }

      throw new Error(
        `[${table} insert failed] ${JSON.stringify(
          {
            code: error.code ?? null,
            message: error.message ?? null,
            details: error.details ?? null,
            hint: error.hint ?? null,
            payloadKeys: Object.keys(currentPayload[0] || {}),
          },
          null,
          2
        )}`
      );
    }

    throw new Error(
      `[${table} insert failed after adaptive retries] ${JSON.stringify(
        {
          lastError,
          payloadKeys: Object.keys(currentPayload[0] || {}),
        },
        null,
        2
      )}`
    );
  };

  const now = new Date().toISOString();
  const style = cleanText(
    (project as Record<string, unknown>).selected_style ||
      (project as Record<string, unknown>).style ||
      (project as Record<string, unknown>).visual_style,
    'cinematic'
  );

  const emotionalCore = safeSlice(
    worldReport?.emotional_core,
    'pressure, survival, transformation, confrontation, release, and emotional truth'
  );

  const visualWorld = safeSlice(
    envSheet?.main_world_description || worldReport?.main_visual_world,
    `a ${style} music-video world shaped by the song atmosphere`
  );

  const colors = safeSlice(
    styleBible?.color_rules || worldReport?.color_palette,
    'deep black, worn steel, dusty amber, electric blue highlights, pale white glow'
  );

  const lighting = safeSlice(
    styleBible?.lighting_rules || worldReport?.lighting_style,
    'cinematic low-key lighting, hard rim light, haze, smoke, glowing practicals'
  );

  const symbols = safeSlice(
    styleBible?.symbolic_motifs || envSheet?.recurring_objects || worldReport?.symbolic_objects,
    'light, shadow, metal, sparks, smoke, reflections, roads, wires, rain, glass'
  );

  const protagonist = cleanText(
    characterSheet?.appearance,
    'A central protagonist shaped by the song, visually grounded and emotionally readable.'
  );

  const sceneSource: Partial<StoryboardScene>[] =
    Array.isArray(scenes) && scenes.length ? scenes : defaultScenes(project);

  await supabase.from('scene_previews').delete().eq('project_id', project.id);
  await supabase.from('scene_visual_prompts').delete().eq('project_id', project.id);

  const promptPayload = sceneSource.map((scene, index) => {
    const sceneNumber = typeof scene.scene_number === 'number' ? scene.scene_number : index + 1;
    const title = getSceneTitle(scene, index);
    const description = cleanText(
      scene.visual_description,
      `A ${style} cinematic scene showing the protagonist inside the emotional world of "${project.title}".`
    );
    const location = cleanText(scene.location, 'symbolic cinematic location');
    const mood = cleanText(scene.mood, emotionalCore);

    return {
      project_id: project.id,
      storyboard_scene_id: scene.id ?? null,
      scene_number: sceneNumber,
      scene_title: title,
      timestamp_range: getSceneTime(scene, index),
      main_image_prompt:
        `${style} cinematic music video still for "${project.title}". Scene ${sceneNumber}: ${title}. ${description} ` +
        `Location: ${location}. Mood: ${mood}. Protagonist: ${protagonist}. ` +
        `World: ${visualWorld}. Palette: ${colors}. Lighting: ${lighting}. ` +
        `Symbols: ${symbols}. Highly cinematic, emotionally grounded, coherent visual world, no text, no watermark.`,
      camera_framing:
        cleanText(scene.camera_direction, 'cinematic framing, emotionally motivated camera movement'),
      lighting_direction: lighting,
      character_placement:
        'Place the protagonist clearly in the frame with consistent silhouette, wardrobe, and emotional posture.',
      mood,
      environment_details: location,
      symbolic_objects: symbols,
      style_consistency_notes:
        `${style}. Match the same character, palette, lighting rules, environment logic, and symbolic motifs across every scene.`,
      negative_prompt:
        'text, watermark, logo, extra fingers, broken anatomy, duplicate faces, inconsistent protagonist, random props, blurry subject, low quality, unrelated style',
      approved: false,
      preview_generated: false,
      updated_at: now,
    };
  });

  const prompts = await insertMany<SceneVisualPrompt>('scene_visual_prompts', promptPayload);

  await supabase
    .from('projects')
    .update({
      status: 'World Assets In Review',
      scene_prompts_approved: false,
      updated_at: now,
    })
    .eq('id', project.id);

  return prompts;
}

