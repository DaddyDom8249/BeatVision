import { supabase } from '@/db/supabase';
import type { SceneImage, SceneVisualPrompt } from '@/types/types';

type LooseRow = Record<string, unknown>;

type PrepareProviderOffSceneImagesArgs = {
  projectId: string;
  scenePrompts: SceneVisualPrompt[];
  existingSceneImages?: SceneImage[];
};

type PrepareProviderOffSceneImagesResult = {
  images: SceneImage[];
  inserted: number;
  repaired: number;
  preserved: number;
  skipped: number;
};

const OPTIONAL_SCENE_IMAGE_COLUMNS = [
  'thumbnail_url',
  'storage_path',
  'prompt_summary',
  'mood',
  'camera_framing',
  'location',
  'character_presence',
  'lighting_direction',
  'style_consistency_summary',
  'generation_status',
  'batch_status',
  'real_generated',
  'manual_upload',
  'use_placeholder_as_draft_final',
  'needs_review',
  'updated_after_approval',
  'rejected',
  'updated_at',
];

const safeString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
};

const getPromptField = (prompt: SceneVisualPrompt, key: string): unknown => {
  return (prompt as unknown as Record<string, unknown>)[key];
};

const missingColumnFromError = (error: unknown, payload: LooseRow): string | null => {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');

  for (const column of OPTIONAL_SCENE_IMAGE_COLUMNS) {
    if (!(column in payload)) continue;
    if (
      message.includes(`'${column}'`) ||
      message.includes(`"${column}"`) ||
      message.includes(` ${column} `) ||
      message.toLowerCase().includes(column.toLowerCase())
    ) {
      return column;
    }
  }

  return null;
};

const insertSceneImageRow = async (row: LooseRow): Promise<SceneImage | null> => {
  const payload: LooseRow = { ...row };

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { data, error } = await supabase
      .from('scene_images')
      .insert(payload)
      .select()
      .maybeSingle();

    if (!error) return (data ?? null) as SceneImage | null;

    const missingColumn = missingColumnFromError(error, payload);
    if (missingColumn) {
      delete payload[missingColumn];
      continue;
    }

    throw error;
  }

  throw new Error('Could not insert scene image row after removing optional compatibility columns.');
};

const updateSceneImageRow = async (id: string, row: LooseRow): Promise<SceneImage | null> => {
  const payload: LooseRow = { ...row };

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { data, error } = await supabase
      .from('scene_images')
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (!error) return (data ?? null) as SceneImage | null;

    const missingColumn = missingColumnFromError(error, payload);
    if (missingColumn) {
      delete payload[missingColumn];
      continue;
    }

    throw error;
  }

  throw new Error('Could not update scene image row after removing optional compatibility columns.');
};

const buildProviderOffSceneImageRow = (
  projectId: string,
  prompt: SceneVisualPrompt,
): LooseRow => {
  const now = new Date().toISOString();

  const sceneNumber =
    typeof prompt.scene_number === 'number'
      ? prompt.scene_number
      : Number(getPromptField(prompt, 'scene_number') ?? 0);

  const sceneTitle = safeString(
    getPromptField(prompt, 'scene_title'),
    `Scene ${sceneNumber || 1}`,
  );

  const timestampRange = safeString(
    getPromptField(prompt, 'timestamp_range'),
    safeString(getPromptField(prompt, 'time_range'), ''),
  );

  const mainPrompt =
    safeString(getPromptField(prompt, 'main_image_prompt')) ||
    safeString(getPromptField(prompt, 'image_prompt')) ||
    safeString(getPromptField(prompt, 'prompt')) ||
    safeString(getPromptField(prompt, 'prompt_text')) ||
    `${sceneTitle}. Create a cinematic scene image based on the approved BeatVision visual prompt.`;

  const mood = safeString(getPromptField(prompt, 'mood'), 'cinematic');
  const camera = safeString(getPromptField(prompt, 'camera_framing'), '');
  const location = safeString(getPromptField(prompt, 'environment_details'), '');
  const characterPresence = safeString(getPromptField(prompt, 'character_presence'), '');
  const lighting = safeString(getPromptField(prompt, 'lighting_direction'), '');

  return {
    project_id: projectId,
    storyboard_scene_id: getPromptField(prompt, 'storyboard_scene_id') ?? null,
    scene_visual_prompt_id: prompt.id ?? null,
    scene_number: sceneNumber || 1,
    scene_title: sceneTitle,
    timestamp_range: timestampRange || null,

    image_url: null,
    thumbnail_url: null,
    storage_path: null,

    prompt_used: mainPrompt,
    prompt_summary: `${sceneTitle} — ${mood}`.slice(0, 500),
    mood,
    camera_framing: camera || null,
    location: location || null,
    character_presence: characterPresence || null,
    lighting_direction: lighting || null,
    style_consistency_summary: safeString(getPromptField(prompt, 'style_consistency_notes'), null as unknown as string) || null,

    generation_status: 'provider_disabled',
    batch_status: 'pending',

    real_generated: false,
    manual_upload: false,
    use_placeholder_as_draft_final: false,

    approved: false,
    rejected: false,
    needs_review: false,
    updated_after_approval: false,
    updated_at: now,
  };
};

const imageHasUsableVisual = (image: SceneImage): boolean => {
  return Boolean(
    image.approved ||
    image.image_url ||
    image.storage_path ||
    image.manual_upload ||
    image.real_generated,
  );
};

export async function prepareProviderOffSceneImages({
  projectId,
  scenePrompts,
  existingSceneImages = [],
}: PrepareProviderOffSceneImagesArgs): Promise<PrepareProviderOffSceneImagesResult> {
  if (!projectId) {
    throw new Error('Cannot prepare scene images without a project id.');
  }

  const approvedPrompts = scenePrompts.filter((prompt) => Boolean(prompt.approved));

  if (!approvedPrompts.length) {
    return {
      images: existingSceneImages,
      inserted: 0,
      repaired: 0,
      preserved: 0,
      skipped: scenePrompts.length,
    };
  }

  const { data: freshImagesRaw, error: freshError } = await supabase
    .from('scene_images')
    .select('*')
    .eq('project_id', projectId)
    .order('scene_number', { ascending: true });

  if (freshError) throw freshError;

  const freshImages = (Array.isArray(freshImagesRaw) ? freshImagesRaw : []) as SceneImage[];

  let inserted = 0;
  let repaired = 0;
  let preserved = 0;

  for (const prompt of approvedPrompts) {
    const promptId = prompt.id;
    const sceneNumber = prompt.scene_number;

    const existing =
      freshImages.find((img) => promptId && img.scene_visual_prompt_id === promptId) ||
      freshImages.find((img) => img.scene_number === sceneNumber);

    if (existing && imageHasUsableVisual(existing)) {
      preserved += 1;
      continue;
    }

    const row = buildProviderOffSceneImageRow(projectId, prompt);

    if (existing?.id) {
      await updateSceneImageRow(existing.id, {
        ...row,
        project_id: undefined,
        scene_visual_prompt_id: row.scene_visual_prompt_id ?? existing.scene_visual_prompt_id,
        scene_number: row.scene_number ?? existing.scene_number,
      });
      repaired += 1;
    } else {
      await insertSceneImageRow(row);
      inserted += 1;
    }
  }

  const { data: finalImagesRaw, error: finalError } = await supabase
    .from('scene_images')
    .select('*')
    .eq('project_id', projectId)
    .order('scene_number', { ascending: true });

  if (finalError) throw finalError;

  return {
    images: (Array.isArray(finalImagesRaw) ? finalImagesRaw : []) as SceneImage[],
    inserted,
    repaired,
    preserved,
    skipped: scenePrompts.length - approvedPrompts.length,
  };
}
