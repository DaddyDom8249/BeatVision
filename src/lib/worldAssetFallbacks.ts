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
      needs_review: false,
      updated_after_approval: false,
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
      needs_review: false,
      updated_after_approval: false,
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
      needs_review: false,
      updated_after_approval: false,
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
      needs_review: false,
      updated_after_approval: false,
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
