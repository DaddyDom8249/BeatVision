import { supabase } from '@/db/supabase';
import type { SceneImage, SceneVisualPrompt } from '@/types/types';

type LooseRow = Record<string, unknown>;

type Args = {
  projectId: string;
  scenePrompts?: SceneVisualPrompt[] | null;
  existingSceneImages?: SceneImage[] | null;
  allowUnapprovedPrompts?: boolean;
};

type Result = {
  images: SceneImage[];
  inserted: number;
  repaired: number;
  preserved: number;
  skipped: number;
};

const optionalColumns = [
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

const rows = <T,>(value: T[] | null | undefined): T[] => Array.isArray(value) ? value : [];

const field = (row: unknown, key: string): unknown =>
  (row as Record<string, unknown> | null | undefined)?.[key];

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const hasVisual = (img: SceneImage): boolean =>
  // Strict: flags can lie. Only an actual image URL/path proves a real image exists.
  Boolean(img.image_url || img.storage_path);

const missingColumn = (error: unknown, payload: LooseRow): string | null => {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');

  return optionalColumns.find((col) => col in payload && message.toLowerCase().includes(col.toLowerCase())) ?? null;
};

async function insertCompat(row: LooseRow): Promise<SceneImage | null> {
  const payload = { ...row };

  for (let i = 0; i < 20; i += 1) {
    const { data, error } = await supabase.from('scene_images').insert(payload).select().maybeSingle();
    if (!error) return (data ?? null) as SceneImage | null;

    const col = missingColumn(error, payload);
    if (col) {
      delete payload[col];
      continue;
    }

    throw error;
  }

  throw new Error('Could not insert scene image row.');
}

async function updateCompat(id: string, row: LooseRow): Promise<SceneImage | null> {
  const payload = { ...row };
  delete payload.project_id;

  for (let i = 0; i < 20; i += 1) {
    const { data, error } = await supabase.from('scene_images').update(payload).eq('id', id).select().maybeSingle();
    if (!error) return (data ?? null) as SceneImage | null;

    const col = missingColumn(error, payload);
    if (col) {
      delete payload[col];
      continue;
    }

    throw error;
  }

  throw new Error('Could not update scene image row.');
}

function buildRow(projectId: string, prompt: SceneVisualPrompt): LooseRow {
  const sceneNumber = Number(field(prompt, 'scene_number') ?? 1) || 1;
  const sceneTitle = text(field(prompt, 'scene_title'), `Scene ${sceneNumber}`);
  const mainPrompt =
    text(field(prompt, 'main_image_prompt')) ||
    text(field(prompt, 'image_prompt')) ||
    text(field(prompt, 'prompt')) ||
    `${sceneTitle}. Cinematic BeatVision scene image based on the approved visual prompt.`;

  const mood = text(field(prompt, 'mood'), 'cinematic');
  const now = new Date().toISOString();

  return {
    project_id: projectId,
    storyboard_scene_id: field(prompt, 'storyboard_scene_id') ?? null,
    scene_visual_prompt_id: field(prompt, 'id') ?? null,
    scene_number: sceneNumber,
    scene_title: sceneTitle,
    timestamp_range: text(field(prompt, 'timestamp_range')) || text(field(prompt, 'time_range')) || null,
    image_url: null,
    thumbnail_url: null,
    storage_path: null,
    prompt_used: mainPrompt,
    prompt_summary: `${sceneTitle} — ${mood}`.slice(0, 500),
    mood,
    camera_framing: text(field(prompt, 'camera_framing')) || null,
    location: text(field(prompt, 'environment_details')) || null,
    character_presence: text(field(prompt, 'character_presence')) || null,
    lighting_direction: text(field(prompt, 'lighting_direction')) || null,
    style_consistency_summary: text(field(prompt, 'style_consistency_notes')) || null,
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
}

export async function prepareProviderOffSceneImages({
  projectId,
  scenePrompts,
  existingSceneImages,
  allowUnapprovedPrompts = false,
}: Args): Promise<Result> {
  if (!projectId) throw new Error('Cannot prepare scene images without a project id.');

  const promptRows = rows(scenePrompts);
  const existingRows = rows(existingSceneImages);

  const usablePrompts = allowUnapprovedPrompts
    ? promptRows
    : promptRows.filter((p) => Boolean(field(p, 'approved')));

  if (!usablePrompts.length) {
    return { images: existingRows, inserted: 0, repaired: 0, preserved: 0, skipped: promptRows.length };
  }

  const { data, error } = await supabase
    .from('scene_images')
    .select('*')
    .eq('project_id', projectId)
    .order('scene_number', { ascending: true });

  if (error) throw error;

  const current = rows(data as SceneImage[] | null);

  let inserted = 0;
  let repaired = 0;
  let preserved = 0;

  for (const prompt of usablePrompts) {
    const promptId = String(field(prompt, 'id') ?? '');
    const sceneNumber = Number(field(prompt, 'scene_number') ?? 0);

    const existing =
      current.find((img) => promptId && img.scene_visual_prompt_id === promptId) ||
      current.find((img) => img.scene_number === sceneNumber);

    if (existing && hasVisual(existing)) {
      preserved += 1;
      continue;
    }

    const row = buildRow(projectId, prompt);

    if (existing?.id) {
      await updateCompat(existing.id, row);
      repaired += 1;
    } else {
      await insertCompat(row);
      inserted += 1;
    }
  }

  const { data: finalData, error: finalError } = await supabase
    .from('scene_images')
    .select('*')
    .eq('project_id', projectId)
    .order('scene_number', { ascending: true });

  if (finalError) throw finalError;

  return {
    images: rows(finalData as SceneImage[] | null),
    inserted,
    repaired,
    preserved,
    skipped: promptRows.length - usablePrompts.length,
  };
}
