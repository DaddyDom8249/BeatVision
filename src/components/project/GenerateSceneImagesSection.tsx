import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  ImageIcon,
  Loader2,
  ChevronDown,
  ChevronUp,
  ListFilter,
  CheckCircle2,
  Sparkles,
  Film,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Project,
  SceneImage,
  SceneImageVersion,
  SceneVisualPrompt,
  WorldStyleBible,
  CharacterSheet,
  EnvironmentSheet,
  ImageGenerationBatch,
} from '@/types/types';
import ImageGenerationOverview from './ImageGenerationOverview';
import SceneImageCard from './SceneImageCard';
import CompareVersionsModal from './CompareVersionsModal';
import ImageReviewMode from './ImageReviewMode';
import ConsistencyControls from './ConsistencyControls';

interface Props {
  project: Project;
  prompts: SceneVisualPrompt[];
  realProvidersEnabled: boolean;
  providerActive: boolean;
  providerName: string;
  providerEndpoint: string | null;
  onProjectUpdate: (updated: Partial<Project>) => void;
  onSceneImagesUpdate: (images: SceneImage[]) => void;
}

type ViewMode = 'cards' | 'review';

export default function GenerateSceneImagesSection({
  project,
  prompts,
  realProvidersEnabled,
  providerActive,
  providerName,
  providerEndpoint,
  onProjectUpdate,
  onSceneImagesUpdate,
}: Props) {
  const [sceneImages, setSceneImages] = useState<SceneImage[]>([]);
  const [versionMap, setVersionMap] = useState<Record<string, SceneImageVersion[]>>({});
  const [styleBible, setStyleBible] = useState<WorldStyleBible | null>(null);
  const [characterSheet, setCharacterSheet] = useState<CharacterSheet | null>(null);
  const [envSheet, setEnvSheet] = useState<EnvironmentSheet | null>(null);
  const [batch, setBatch] = useState<ImageGenerationBatch | null>(null);

  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [compareTarget, setCompareTarget] = useState<SceneImage | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [refreshing, setRefreshing] = useState(false);

  const [showOverview, setShowOverview] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [showReviewMode, setShowReviewMode] = useState(false);

  // Credit confirmation dialog state
  const [pendingCreditAction, setPendingCreditAction] = useState<null | { sceneImageId: string; promptId: string; mode: 'single' | 'all' }>(null);

  const approvedPrompts = prompts.filter(p => p.approved);
  const totalPrompts = approvedPrompts.length;
  const approvedImages = sceneImages.filter(si => si.approved).length;
  // Check that every approved prompt has a corresponding approved image (not just count >=)
  const allImagesApproved = totalPrompts > 0 &&
    approvedPrompts.every(p => sceneImages.some(si => si.scene_visual_prompt_id === p.id && si.approved));

  // Load existing scene images + versions + world assets
  const loadData = useCallback(async () => {
    const [imagesRes, bibleRes, charRes, envRes, batchRes] = await Promise.all([
      supabase
        .from('scene_images')
        .select('*')
        .eq('project_id', project.id)
        .order('scene_number', { ascending: true }),
      supabase
        .from('world_style_bibles')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('character_sheets')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('environment_sheets')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('image_generation_batches')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const imgs: SceneImage[] = Array.isArray(imagesRes.data) ? imagesRes.data : [];
    setSceneImages(imgs);
    onSceneImagesUpdate(imgs);
    if (bibleRes.data) setStyleBible(bibleRes.data as WorldStyleBible);
    if (charRes.data) setCharacterSheet(charRes.data as CharacterSheet);
    if (envRes.data) setEnvSheet(envRes.data as EnvironmentSheet);
    if (batchRes.data) setBatch(batchRes.data as ImageGenerationBatch);

    // Load versions for all images
    if (imgs.length > 0) {
      const { data: vData } = await supabase
        .from('scene_image_versions')
        .select('*')
        .in('scene_image_id', imgs.map(i => i.id))
        .order('version_number', { ascending: true });
      if (vData) {
        const map: Record<string, SceneImageVersion[]> = {};
        for (const v of vData as SceneImageVersion[]) {
          if (!map[v.scene_image_id]) map[v.scene_image_id] = [];
          map[v.scene_image_id].push(v);
        }
        setVersionMap(map);
      }
    }
  }, [project.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const buildConsistency = () => ({
    character: project.image_consistency_character,
    environment: project.image_consistency_environment,
    style: project.image_consistency_style,
    storyboard: project.image_consistency_storyboard,
    allowVariation: project.image_allow_variation,
  });

  // Timeout-protected edge function call — never leaves a scene stuck in generating
  const callGenerateImagePrompt = async (
    prompt: SceneVisualPrompt,
    seed = 1
  ): Promise<Record<string, unknown> | null> => {
    const TIMEOUT_MS = 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const { data, error } = await supabase.functions.invoke('beatvision-generate', {
        body: {
          action: 'generate_scene_image_prompt',
          projectTitle: project.title,
          style: project.selected_style,
          lyrics: project.lyrics || '',
          scenePrompt: prompt,
          styleBible: styleBible || {},
          characterSheet: characterSheet || {},
          envSheet: envSheet || {},
          consistency: buildConsistency(),
          seed,
        },
        signal: controller.signal,
      });
      if (error) {
        const msg = await error?.context?.text?.();
        console.error('generate_scene_image_prompt error:', msg || error.message);
        return null;
      }
      return (data as { data: Record<string, unknown> })?.data || null;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('generate_scene_image_prompt timed out after 30s');
        toast.error('Image generation did not complete. You can retry or use a placeholder preview.');
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  // Persist a scene image record + first version.
  // isRealGenerated=true only when an actual image_url was produced by a provider.
  const persistSceneImage = async (
    prompt: SceneVisualPrompt,
    imageData: Record<string, unknown>,
    existingId?: string,
    isRealGenerated = false,
    resolvedImageUrl: string | null = null
  ): Promise<SceneImage | null> => {
    const record = {
      project_id: project.id,
      storyboard_scene_id: prompt.storyboard_scene_id,
      scene_visual_prompt_id: prompt.id,
      scene_number: imageData.scene_number as number,
      scene_title: imageData.scene_title as string | null,
      timestamp_range: imageData.timestamp_range as string | null,
      image_url: resolvedImageUrl,
      thumbnail_url: null,
      prompt_used: imageData.prompt_used as string | null,
      prompt_summary: imageData.prompt_summary as string | null,
      mood: imageData.mood as string | null,
      camera_framing: imageData.camera_framing as string | null,
      location: imageData.location as string | null,
      character_presence: imageData.character_presence as string | null,
      lighting_direction: imageData.lighting_direction as string | null,
      style_consistency_summary: imageData.style_consistency_summary as string | null,
      real_generated: isRealGenerated,
      manual_upload: false,
      placeholder: !isRealGenerated && !resolvedImageUrl,
      use_placeholder_as_draft_final: false,
      provider_name: isRealGenerated ? providerName : 'Manual Upload Only',
      // Only mark as 'generated' (prompt-descriptor stage) if no real image returned.
      // If a real image URL exists, mark as needing review.
      generation_status: isRealGenerated ? 'generated' : 'placeholder_preview',
      placeholder_description: imageData.placeholder_description as string | null,
      placeholder_gradient_start: imageData.placeholder_gradient_start as string | null,
      placeholder_gradient_end: imageData.placeholder_gradient_end as string | null,
      placeholder_accent: imageData.placeholder_accent as string | null,
      placeholder_label_1: imageData.placeholder_label_1 as string | null,
      placeholder_label_2: imageData.placeholder_label_2 as string | null,
      approved: false,
      rejected: false,
      active_version: 1,
      updated_at: new Date().toISOString(),
    };

    let sceneImg: SceneImage | null = null;

    if (existingId) {
      const { data } = await supabase
        .from('scene_images')
        .update({ ...record })
        .eq('id', existingId)
        .select()
        .maybeSingle();
      sceneImg = data as SceneImage | null;
    } else {
      const { data } = await supabase
        .from('scene_images')
        .insert({ ...record })
        .select()
        .maybeSingle();
      sceneImg = data as SceneImage | null;
    }

    if (!sceneImg) return null;

    // Determine next version number
    const existingVersions = versionMap[sceneImg.id] || [];
    const nextVersion = existingVersions.length + 1;

    await supabase.from('scene_image_versions').insert({
      scene_image_id: sceneImg.id,
      version_number: nextVersion,
      image_url: resolvedImageUrl,
      prompt_used: imageData.prompt_used as string | null,
      notes: nextVersion === 1 ? 'Initial generation' : `Regenerated version ${nextVersion}`,
      approved: false,
    });

    return sceneImg;
  };

  // ── Real provider call (credit-gated) ─────────────────────────────────────
  // Only runs when: realProvidersEnabled=true, providerActive=true, user confirmed credit warning.
  // Supports Custom Image API and Local Image API via POST to providerEndpoint.
  // Returns a public image URL or null on failure.
  const callRealProvider = async (
    prompt: SceneVisualPrompt,
    seed = 1
  ): Promise<string | null> => {
    if (!realProvidersEnabled || !providerActive || !providerEndpoint) return null;

    const body = {
      prompt: prompt.main_image_prompt || '',
      negative_prompt: prompt.negative_prompt || '',
      aspect_ratio: '16:9',
      output_size: '1024x576',
      model_name: '',
      project_id: project.id,
      scene_number: prompt.scene_number,
      seed,
    };

    try {
      const res = await fetch(providerEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Provider returned ${res.status}: ${errText}`);
      }
      const json = await res.json();

      // Support image_url or base64 response
      if (json.image_url) return json.image_url as string;
      if (json.base64 || json.data) {
        const b64 = json.base64 || json.data;
        const byteStr = atob(b64);
        const arr = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
        const blob = new Blob([arr], { type: 'image/png' });
        const path = `scene-images/${project.id}/provider-${Date.now()}-s${prompt.scene_number}.png`;
        const { error: upErr } = await supabase.storage.from('scene-images').upload(path, blob, { upsert: true });
        if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
        const { data: urlData } = supabase.storage.from('scene-images').getPublicUrl(path);
        return urlData.publicUrl;
      }
      throw new Error('Provider response did not contain image_url or base64 data.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown provider error';
      toast.error(`Provider error: ${msg}`);
      return null;
    }
  };

  // ── Generate all scene images ──────────────────────────────────────────────
  // If real provider is active: show credit confirm first.
  // If no provider: show clear message — do NOT silently create fake generated records.
  const handleGenerateAllClick = () => {
    if (!realProvidersEnabled || !providerActive) {
      void (async () => {
        const manualNow = new Date().toISOString();
        const approvedPromptsForManualSlots = prompts.filter((p) => Boolean(p.approved));

        if (approvedPromptsForManualSlots.length === 0) {
          toast.error('Approve scene visual prompts before preparing manual image slots.');
          return;
        }

        const { data: existingManualRowsRaw } = await supabase
          .from('scene_images')
          .select('*')
          .eq('project_id', project.id);

        const existingManualRows = Array.isArray(existingManualRowsRaw) ? existingManualRowsRaw : [];
        const existingPromptIds = new Set(
          existingManualRows
            .map((row: any) => row.scene_visual_prompt_id)
            .filter(Boolean)
        );

        const manualSlotPayload: Record<string, unknown>[] = approvedPromptsForManualSlots
          .filter((prompt) => !existingPromptIds.has(prompt.id))
          .map((prompt) => ({
            project_id: project.id,
            scene_visual_prompt_id: prompt.id,
            scene_number: prompt.scene_number,
            scene_index: Number(prompt.scene_number ?? 0),
            prompt_text: prompt.main_image_prompt,
            image_prompt: prompt.main_image_prompt,
            generation_prompt: prompt.main_image_prompt,
            provider: 'manual-upload',
            provider_name: 'manual-upload',
            generation_status: 'awaiting_upload',
            approved: false,
            rejected: false,
            real_generated: false,
            manual_upload: true,
            use_placeholder_as_draft_final: false,
            updated_at: manualNow,
            created_at: manualNow,
          }));

        const adaptiveInsertManualSlots = async (payload: Record<string, unknown>[]) => {
          if (payload.length === 0) return [];

          let currentPayload = payload.map((row) => ({ ...row }));
          let lastError: unknown = null;

          for (let attempt = 1; attempt <= 12; attempt += 1) {
            const { data, error } = await supabase
              .from('scene_images')
              .insert(currentPayload)
              .select();

            if (!error) {
              return Array.isArray(data) ? data : [];
            }

            lastError = error;

            const missingColumn = (error.message || '').match(/'([^']+)' column/)?.[1];

            if (error.code === 'PGRST204' && missingColumn) {
              console.warn(`[BeatVision] Removing unsupported scene_images column "${missingColumn}" and retrying manual slot insert.`);
              currentPayload = currentPayload.map((row) => {
                const next = { ...row };
                delete next[missingColumn];
                return next;
              });
              continue;
            }

            throw new Error(
              `[scene_images manual slot insert failed] ${JSON.stringify(
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
            `[scene_images manual slot insert failed after adaptive retries] ${JSON.stringify(
              {
                lastError,
                payloadKeys: Object.keys(currentPayload[0] || {}),
              },
              null,
              2
            )}`
          );
        };

        try {
          const insertedManualSlots = await adaptiveInsertManualSlots(manualSlotPayload);

          const { data: refreshedManualRowsRaw } = await supabase
            .from('scene_images')
            .select('*')
            .eq('project_id', project.id)
            .order('scene_number', { ascending: true });

          const refreshedManualRows = Array.isArray(refreshedManualRowsRaw)
            ? refreshedManualRowsRaw
            : [...existingManualRows, ...insertedManualSlots];

          onSceneImagesUpdate(refreshedManualRows as any);

          const { data: updatedManualProject } = await supabase
            .from('projects')
            .update({
              status: 'Scene Images Awaiting Upload',
              updated_at: manualNow,
            })
            .eq('id', project.id)
            .select()
            .maybeSingle();

          if (updatedManualProject) {
            onProjectUpdate(updatedManualProject as any);
          } else {
            onProjectUpdate({
              ...project,
              status: 'Scene Images Awaiting Upload',
              updated_at: manualNow,
            } as any);
          }

          toast.success(
            insertedManualSlots.length > 0
              ? `Provider-off manual upload slots prepared: ${insertedManualSlots.length}.`
              : 'Provider-off manual upload slots were already prepared.'
          );
        } catch (manualSlotErr) {
          const message = manualSlotErr instanceof Error ? manualSlotErr.message : String(manualSlotErr);
          console.error('[BeatVision] Provider-off manual upload slot prep failed:', manualSlotErr);
          toast.error(`Manual image slot prep failed: ${message}`, { duration: 20000 });
        }
      })();

      return;
    }
    setPendingCreditAction({ sceneImageId: '', promptId: '', mode: 'all' });
  };

  const handleGenerateAll = async () => {
    if (approvedPrompts.length === 0) {
      toast.error('No approved scene prompts found.');
      return;
    }
    setGeneratingAll(true);

    // Create batch record
    const { data: batchData } = await supabase
      .from('image_generation_batches')
      .insert({
        project_id: project.id,
        generation_started_at: new Date().toISOString(),
        total_scenes: approvedPrompts.length,
        generated_scenes: 0,
        approved_scenes: 0,
        status: 'generating',
      })
      .select()
      .maybeSingle();
    if (batchData) setBatch(batchData as ImageGenerationBatch);

    await supabase
      .from('projects')
      .update({ status: 'Generating Scene Images', updated_at: new Date().toISOString() })
      .eq('id', project.id);
    onProjectUpdate({ status: 'Generating Scene Images' });

    try {
      const newImages: SceneImage[] = [];
      let generated = 0;

      for (const prompt of approvedPrompts) {
        const existing = sceneImages.find(si => si.scene_visual_prompt_id === prompt.id);

        // Get prompt descriptor from edge function
        const imageData = await callGenerateImagePrompt(prompt);
        if (!imageData) {
          if (existing) {
            await supabase
              .from('scene_images')
              .update({ generation_status: 'failed', updated_at: new Date().toISOString() })
              .eq('id', existing.id);
          }
          continue;
        }

        // Call real provider if active
        let resolvedUrl: string | null = null;
        if (realProvidersEnabled && providerActive) {
          resolvedUrl = await callRealProvider(prompt, generated + 1);
        }
        // If provider failed, do NOT pretend — leave image_url null, mark placeholder
        const saved = await persistSceneImage(prompt, imageData, existing?.id, !!resolvedUrl, resolvedUrl);
        if (saved) {
          newImages.push(saved);
          generated++;
          if (batchData) {
            await supabase
              .from('image_generation_batches')
              .update({ generated_scenes: generated, updated_at: new Date().toISOString() })
              .eq('id', batchData.id);
          }
        }
      }

      if (batchData) {
        await supabase
          .from('image_generation_batches')
          .update({
            generation_completed_at: new Date().toISOString(),
            generated_scenes: generated,
            status: generated > 0 ? 'completed' : 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', batchData.id);
      }

      await supabase
        .from('projects')
        .update({ status: 'Scene Images In Review', updated_at: new Date().toISOString() })
        .eq('id', project.id);
      onProjectUpdate({ status: 'Scene Images In Review' });

      await loadData();
      if (generated > 0) {
        toast.success(`${generated} scene image${generated !== 1 ? 's' : ''} generated. Review and approve each one.`);
      } else {
        toast.warning('Prompt descriptors created but no images were returned by the provider. Upload images manually or create placeholder previews.');
      }
    } catch (err) {
      toast.error('Image generation failed. Please try again.');
      console.error(err);
    } finally {
      setGeneratingAll(false);
    }
  };

  // ── Generate single scene image ────────────────────────────────────────────
  const handleGenerateSingleClick = (sceneImageId: string, promptId: string) => {
    if (!realProvidersEnabled || !providerActive) {
      toast.error(
        'No real image provider is connected. Upload a scene image manually or create a placeholder preview.',
        { duration: 5000 }
      );
      return;
    }
    setPendingCreditAction({ sceneImageId, promptId, mode: 'single' });
  };

  const handleGenerateSingle = async (sceneImageId: string, promptId: string) => {
    const prompt = prompts.find(p => p.id === promptId);
    if (!prompt) return;

    setGeneratingIds(prev => new Set([...prev, sceneImageId]));
    try {
      const imageData = await callGenerateImagePrompt(prompt);
      if (!imageData) {
        await supabase
          .from('scene_images')
          .update({ generation_status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', sceneImageId);
        setSceneImages(prev => prev.map(si =>
          si.id === sceneImageId ? { ...si, generation_status: 'failed' as const } : si
        ));
        toast.error('Image generation did not complete. You can retry or upload/create a placeholder preview.');
        return;
      }

      let resolvedUrl: string | null = null;
      if (realProvidersEnabled && providerActive) {
        resolvedUrl = await callRealProvider(prompt);
      }

      const existing = sceneImages.find(si => si.id === sceneImageId);
      const saved = await persistSceneImage(prompt, imageData, existing?.id, !!resolvedUrl, resolvedUrl);
      if (saved) {
        setSceneImages(prev => {
          const next = prev.map(si => si.id === sceneImageId ? saved : si);
          onSceneImagesUpdate(next);
          return next;
        });
      }
      if (resolvedUrl) {
        toast.success('Scene image generated successfully.');
      } else {
        toast.warning('Prompt descriptor created. No image was returned — upload an image or create a placeholder preview.');
      }
    } catch (err) {
      await supabase
        .from('scene_images')
        .update({ generation_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', sceneImageId);
      setSceneImages(prev => prev.map(si =>
        si.id === sceneImageId ? { ...si, generation_status: 'failed' as const } : si
      ));
      toast.error('Failed to generate image. Please try again.');
      console.error(err);
    } finally {
      setGeneratingIds(prev => { const s = new Set(prev); s.delete(sceneImageId); return s; });
    }
  };

  // ── Regenerate (new version) ───────────────────────────────────────────────
  const handleRegenerate = async (sceneImageId: string, promptId: string) => {
    const prompt = prompts.find(p => p.id === promptId);
    if (!prompt) return;

    // Regenerate always requires an active provider
    if (!realProvidersEnabled || !providerActive) {
      toast.error('No real image provider connected. Upload an image manually to replace this one.', { duration: 5000 });
      return;
    }

    const existing = sceneImages.find(si => si.id === sceneImageId);
    setGeneratingIds(prev => new Set([...prev, sceneImageId]));
    try {
      const seed = (existing ? (versionMap[sceneImageId]?.length ?? 0) + 1 : 1);
      const imageData = await callGenerateImagePrompt(prompt, seed);
      if (!imageData) {
        await supabase
          .from('scene_images')
          .update({ generation_status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', sceneImageId);
        setSceneImages(prev => prev.map(si =>
          si.id === sceneImageId ? { ...si, generation_status: 'failed' as const } : si
        ));
        toast.error('Image generation did not complete. You can retry or upload/create a placeholder preview.');
        return;
      }
      const resolvedUrl = await callRealProvider(prompt, seed);
      const saved = await persistSceneImage(prompt, imageData, existing?.id, !!resolvedUrl, resolvedUrl);
      if (saved) {
        setSceneImages(prev => {
          const next = prev.map(si => si.id === sceneImageId ? saved : si);
          onSceneImagesUpdate(next);
          return next;
        });
      }
      if (resolvedUrl) {
        toast.success('New version generated.');
      } else {
        toast.warning('New prompt version created but provider returned no image. Upload an image to use this scene.');
      }
    } catch (err) {
      await supabase
        .from('scene_images')
        .update({ generation_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', sceneImageId);
      setSceneImages(prev => prev.map(si =>
        si.id === sceneImageId ? { ...si, generation_status: 'failed' as const } : si
      ));
      toast.error('Failed to regenerate. Please try again.');
      console.error(err);
    } finally {
      setGeneratingIds(prev => { const s = new Set(prev); s.delete(sceneImageId); return s; });
    }
  };

  // ── Refresh scene images ───────────────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    toast.success('Scene images refreshed.');
  };

  // Approve a scene image — fully clears ALL stale pending/review state.
  // Approval requires: real_generated OR manual_upload OR use_placeholder_as_draft_final.
  const handleApprove = async (sceneImageId: string) => {
    const img = sceneImages.find(si => si.id === sceneImageId);
    if (!img) return;

    // Only allow approval when image has real content or is accepted placeholder
    if (!img.real_generated && !img.manual_upload && !img.use_placeholder_as_draft_final) {
      toast.error('Cannot approve: this scene needs a real image, manual upload, or an accepted placeholder draft.');
      return;
    }

    const now = new Date().toISOString();
    await supabase
      .from('scene_images')
      .update({
        approved: true,
        rejected: false,
        generation_status: 'approved',
        needs_review: false,
        updated_after_approval: false,
        pending: false,
        last_approved_at: now,
        updated_at: now,
      })
      .eq('id', sceneImageId);

    // Exclusive version approval
    const vList = versionMap[sceneImageId] || [];
    const activeV = img?.active_version ?? (vList.length > 0 ? vList[vList.length - 1].version_number : null);
    if (vList.length > 0) {
      await supabase.from('scene_image_versions').update({ approved: false }).eq('scene_image_id', sceneImageId);
    }
    if (activeV !== null) {
      await supabase.from('scene_image_versions').update({ approved: true }).eq('scene_image_id', sceneImageId).eq('version_number', activeV);
    }

    const updated = sceneImages.map(si =>
      si.id === sceneImageId
        ? { ...si, approved: true, rejected: false, generation_status: 'approved' as const, needs_review: false, updated_after_approval: false, pending: false, last_approved_at: now }
        : si
    );
    setSceneImages(updated);
    onSceneImagesUpdate(updated);
    toast.success('Scene image approved.');

    const { count: dbApprovedCount } = await supabase
      .from('scene_images')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('approved', true);

    // All approved prompts have an approved image covering them
    const allPromptsCovered = totalPrompts > 0 &&
      approvedPrompts.every(p =>
        updated.some(si => si.scene_visual_prompt_id === p.id && si.approved)
      );

    // Fallback: no prompts exist but manual uploads are approved (manual-upload-only workflow)
    const noPromptManualWorkflow = totalPrompts === 0 && (dbApprovedCount ?? 0) > 0;

    if ((allPromptsCovered && (dbApprovedCount ?? 0) >= totalPrompts) || noPromptManualWorkflow) {
      await supabase
        .from('projects')
        .update({ status: 'Ready for Motion', images_approved: true, updated_at: now })
        .eq('id', project.id);
      onProjectUpdate({ status: 'Ready for Motion', images_approved: true });
      toast.success('All scene images approved! Your project is Ready for Motion.', { duration: 5000 });
    }
  };

  // Reject a scene image — clears approved state, marks for regeneration
  const handleReject = async (sceneImageId: string) => {
    const now = new Date().toISOString();
    await supabase
      .from('scene_images')
      .update({ rejected: true, approved: false, generation_status: 'generated', needs_review: false, updated_at: now })
      .eq('id', sceneImageId);
    setSceneImages(prev => {
      const next = prev.map(si => si.id === sceneImageId ? { ...si, rejected: true, approved: false, generation_status: 'generated' as const } : si);
      onSceneImagesUpdate(next);
      return next;
    });
    toast.info('Scene marked for regeneration.');
  };

  // Select a specific version as the active approved version
  // Only one version per scene can be the active approved version at a time
  const handleSelectVersion = async (sceneImageId: string, version: SceneImageVersion) => {
    const now = new Date().toISOString();

    // Clear ALL stale state on the parent when a version is selected
    await supabase
      .from('scene_images')
      .update({
        active_version: version.version_number,
        image_url: version.image_url,
        needs_review: false,
        updated_after_approval: false,
        updated_at: now,
      })
      .eq('id', sceneImageId);

    // Exclusive: clear all version approvals, then set only the selected version
    await supabase
      .from('scene_image_versions')
      .update({ approved: false })
      .eq('scene_image_id', sceneImageId);
    await supabase
      .from('scene_image_versions')
      .update({ approved: true })
      .eq('id', version.id);

    await loadData();
    setCompareTarget(null);
    toast.success(`Version ${version.version_number} set as active.`);
  };

  // Edit prompt fields
  const handleEditPrompt = async (prompt: SceneVisualPrompt, updatedFields: Partial<SceneVisualPrompt>) => {
    await supabase
      .from('scene_visual_prompts')
      .update({ ...updatedFields, updated_at: new Date().toISOString() })
      .eq('id', prompt.id);
    toast.success('Prompt updated. Regenerate the image to use the new prompt.');
  };

  // Manual upload — mark as manual_upload source; counts toward motion after approval
  const handleUpload = async (sceneImageId: string, file: File) => {
    const img = sceneImages.find(si => si.id === sceneImageId);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const sceneIndex = img?.scene_number ?? 0;
    const storagePath = `${project.id}/scene-${sceneIndex}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('scene-images')
      .upload(storagePath, file, { upsert: true });
    if (uploadError) {
      toast.error(`Upload failed: ${uploadError.message}`);
      return;
    }
    const { data: urlData } = supabase.storage.from('scene-images').getPublicUrl(storagePath);
    const now = new Date().toISOString();
    const { error: dbError } = await supabase
      .from('scene_images')
      .update({
        image_url: urlData.publicUrl,
        storage_path: storagePath,
        manual_upload: true,
        real_generated: false,
        placeholder: false,
        use_placeholder_as_draft_final: false,
        provider_name: 'manual_upload',
        generation_status: 'uploaded',
        approved: false,
        rejected: false,
        pending: false,
        updated_after_approval: false,
        updated_at: now,
      })
      .eq('id', sceneImageId);
    if (dbError) {
      toast.error(`Failed to save upload: ${dbError.message}`);
      return;
    }
    setSceneImages(prev => {
      const next = prev.map(si =>
        si.id === sceneImageId
          ? {
              ...si,
              image_url: urlData.publicUrl,
              storage_path: storagePath,
              manual_upload: true,
              real_generated: false,
              placeholder: false,
              use_placeholder_as_draft_final: false,
              provider_name: 'manual_upload',
              generation_status: 'uploaded' as const,
              approved: false,
              rejected: false,
              updated_after_approval: false,
            }
          : si
      );
      onSceneImagesUpdate(next);
      return next;
    });
    toast.success('Scene image uploaded. Approve it to count toward motion.');
  };

  // Create placeholder preview card — clearly NOT a generated image
  const handleCreatePlaceholder = async (sceneImageId: string) => {
    const img = sceneImages.find(si => si.id === sceneImageId);
    if (!img) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('scene_images')
      .update({
        placeholder: true,
        real_generated: false,
        manual_upload: false,
        use_placeholder_as_draft_final: false,
        generation_status: 'placeholder_preview',
        placeholder_label_1: img.scene_title || `Scene ${img.scene_number}`,
        placeholder_label_2: img.mood || '',
        placeholder_description: [img.location, img.camera_framing, img.lighting_direction].filter(Boolean).join(' · ') || null,
        updated_at: now,
      })
      .eq('id', sceneImageId);
    if (error) {
      toast.error(`Failed to create placeholder: ${error.message}`);
      return;
    }
    setSceneImages(prev => {
      const next = prev.map(si =>
        si.id === sceneImageId
          ? { ...si, placeholder: true, real_generated: false, manual_upload: false, use_placeholder_as_draft_final: false, generation_status: 'placeholder_preview' as const }
          : si
      );
      onSceneImagesUpdate(next);
      return next;
    });
    toast.success('Placeholder preview created. This is not a generated image.');
  };

  // Accept placeholder as draft final
  const handleUsePlaceholderAsDraft = async (sceneImageId: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('scene_images')
      .update({ use_placeholder_as_draft_final: true, updated_at: now })
      .eq('id', sceneImageId);
    if (error) {
      toast.error(`Failed to accept placeholder: ${error.message}`);
      return;
    }
    setSceneImages(prev => {
      const next = prev.map(si => si.id === sceneImageId ? { ...si, use_placeholder_as_draft_final: true } : si);
      onSceneImagesUpdate(next);
      return next;
    });
    toast.warning('Placeholder accepted for draft rendering. Replace with a real image before final production.');
  };

  // Update consistency toggles
  const handleConsistencyChange = async (key: keyof Project, value: boolean) => {
    await supabase
      .from('projects')
      .update({ [key]: value, updated_at: new Date().toISOString() })
      .eq('id', project.id);
    onProjectUpdate({ [key]: value });
  };

  const promptMap = Object.fromEntries(prompts.map(p => [p.id, p]));
  const getPromptForImage = (img: SceneImage) =>
    img.scene_visual_prompt_id ? promptMap[img.scene_visual_prompt_id] ?? null : null;

  const hasAnyImages = sceneImages.length > 0;

  const approvedScenePromptCountForMotion = prompts.filter((prompt) => Boolean(prompt.approved)).length;
  const validApprovedSceneImagesForMotion = sceneImages.filter((image) =>
    Boolean(
      image.approved &&
      (
        image.real_generated ||
        image.manual_upload ||
        image.use_placeholder_as_draft_final ||
        image.provider === 'manual_upload' ||
        image.provider_name === 'manual_upload' ||
        image.generation_status === 'uploaded' ||
        image.generation_status === 'manual_upload'
      ) &&
      (
        image.image_url ||
        image.use_placeholder_as_draft_final ||
        image.placeholder
      )
    )
  );

  const allSceneImagesApprovedForMotion =
    approvedScenePromptCountForMotion > 0 &&
    validApprovedSceneImagesForMotion.length >= approvedScenePromptCountForMotion;

  useEffect(() => {
    if (!project?.id || !allSceneImagesApprovedForMotion) return;

    if (project.images_approved && project.status === 'Scene Images Approved') return;

    let cancelled = false;

    void (async () => {
      const now = new Date().toISOString();
      let updatePayload: Record<string, unknown> = {
        images_approved: true,
        status: 'Scene Images Approved',
        updated_at: now,
      };

      for (let attempt = 1; attempt <= 4; attempt += 1) {
        const { data, error } = await supabase
          .from('projects')
          .update(updatePayload)
          .eq('id', project.id)
          .select()
          .maybeSingle();

        if (!error) {
          if (!cancelled) {
            onProjectUpdate(data ?? updatePayload);
          }
          return;
        }

        const missingColumn = error.message?.match(/'([^']+)' column/)?.[1];

        if (error.code === 'PGRST204' && missingColumn && missingColumn in updatePayload) {
          const next = { ...updatePayload };
          delete next[missingColumn];
          updatePayload = next;
          continue;
        }

        console.warn('[BeatVision] Could not sync image approval project gate:', error);
        if (!cancelled) {
          onProjectUpdate({
            images_approved: true,
            status: 'Scene Images Approved',
            updated_at: now,
          } as any);
        }
        return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    allSceneImagesApprovedForMotion,
    onProjectUpdate,
    project?.id,
    project?.images_approved,
    project?.status,
  ]);


  // Provider status label for display
  const providerStatusLabel = realProvidersEnabled && providerActive
    ? `Provider: ${providerName}`
    : realProvidersEnabled
    ? 'Provider configured but not active'
    : 'Credit-Safe Mode — provider disabled';

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded p-5 md:p-6">
        <div className="flex items-start gap-3">
          <ImageIcon className="w-5 h-5 text-[#3b7eff] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="font-mono text-base md:text-lg font-bold text-foreground tracking-tight">
              Generate Scene Images
            </h2>
            <p className="text-sm text-[#777] leading-relaxed mt-1 text-pretty">
              Your world assets are approved. Review the Image Provider Settings above to connect a real image provider, or upload images manually. BeatVision never calls a paid provider without your explicit action.
            </p>
            {/* Provider status */}
            <div
              className="mt-3 inline-flex items-center gap-2 rounded px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest"
              style={
                realProvidersEnabled && providerActive
                  ? { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }
                  : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#555' }
              }
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: realProvidersEnabled && providerActive ? '#10b981' : '#444' }}
              />
              {providerStatusLabel}
            </div>
          </div>
        </div>
      </div>

      {/* Overview */}
      <div>
        <button
          onClick={() => setShowOverview(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-[#111] border border-[#222] rounded font-mono text-xs text-[#3b7eff] uppercase tracking-widest hover:border-[#333] transition-all"
        >
          Image Generation Overview
          {showOverview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showOverview && (
          <div className="mt-2">
            <ImageGenerationOverview
              project={project}
              sceneImages={sceneImages}
              totalPrompts={totalPrompts}
            />
          </div>
        )}
      </div>

      {/* Generate All + Refresh */}
      {/* Why Can't I Generate? — shows exact blockers when provider is off or no prompts */}
      {(!realProvidersEnabled || !providerActive || approvedPrompts.length === 0) && (
        <div
          className="rounded p-4 space-y-2"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <p className="font-mono text-[10px] uppercase tracking-widest text-yellow-500/70 mb-1">
            Why Can&apos;t I Generate Images?
          </p>
          {!realProvidersEnabled && (
            <div className="flex items-start gap-2">
              <span className="text-yellow-400/70 mt-0.5 shrink-0">•</span>
              <span className="text-xs text-muted-foreground/60">
                <strong className="text-foreground/60">Manual upload required. No image provider connected.</strong>{' '}
                Real AI Providers are disabled (credit-safe mode). Use the <strong className="text-[#3b7eff]/80">Upload Image</strong> button
                on each scene card to add images manually, or enable a provider in Image Provider Settings above.
              </span>
            </div>
          )}
          {realProvidersEnabled && !providerActive && (
            <div className="flex items-start gap-2">
              <span className="text-yellow-400/70 mt-0.5 shrink-0">•</span>
              <span className="text-xs text-muted-foreground/60">
                <strong className="text-foreground/60">Manual upload required.</strong> No image provider connected.
                Use the <strong className="text-[#3b7eff]/80">Upload Image</strong> button on each scene card below,
                or add a provider endpoint in Image Provider Settings above.
              </span>
            </div>
          )}
          {approvedPrompts.length === 0 && (
            <div className="flex items-start gap-2">
              <span className="text-yellow-400/70 mt-0.5 shrink-0">•</span>
              <span className="text-xs text-muted-foreground/60">
                No approved scene visual prompts found. Approve prompts in the Scene Visual Prompts section (Phase 3) first.
              </span>
            </div>
          )}
          <div
            className="mt-3 rounded px-3 py-2 text-xs text-muted-foreground/50"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <strong className="text-foreground/50">Alternatives without a provider:</strong>
            <span className="ml-1">Upload images manually using the &quot;Upload Image&quot; button on each scene card, or create placeholder previews and accept them as draft finals.</span>
          </div>
        </div>
      )}

      {/* Generate All + Refresh */}
      <div className="bg-[#111] border border-[#222] rounded p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <h3 className="font-mono text-sm font-bold text-foreground">
              {hasAnyImages ? 'Regenerate All Scene Images' : 'Generate All Scene Images'}
            </h3>
            <p className="text-xs text-[#666] mt-1 leading-relaxed">
              {approvedPrompts.length} approved scene prompt{approvedPrompts.length !== 1 ? 's' : ''} ready.
              {!realProvidersEnabled || !providerActive
                ? ' No provider connected — use manual upload or create placeholder previews per scene.'
                : ` Will call ${providerName} for each scene. Provider credits will be used after confirmation.`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="ghost"
              className="border border-[#333] text-[#555] hover:text-foreground font-mono text-xs h-9 px-3"
            >
              {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              <span className="ml-1.5">Refresh</span>
            </Button>
            <Button
              onClick={handleGenerateAllClick}
              disabled={generatingAll || approvedPrompts.length === 0}
              className="bg-[#3b7eff] hover:bg-[#2563eb] text-white font-mono text-sm h-9 px-5"
            >
              {generatingAll ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" />{hasAnyImages ? 'Regenerate All' : 'Generate All Scene Images'}</>
              )}
            </Button>
          </div>
        </div>

        {/* Batch progress */}
        {batch && batch.status === 'generating' && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[10px] text-[#555]">Generating…</span>
              <span className="font-mono text-[10px] text-[#555]">
                {batch.generated_scenes}/{batch.total_scenes}
              </span>
            </div>
            <div className="w-full h-0.5 bg-[#1e1e1e] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#3b7eff] transition-all duration-300"
                style={{ width: batch.total_scenes > 0 ? `${(batch.generated_scenes / batch.total_scenes) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* View mode toggle */}
      {hasAnyImages && (
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-2 font-mono text-xs px-3 py-1.5 rounded border transition-all ${
              viewMode === 'cards'
                ? 'bg-[#3b7eff]/20 border-[#3b7eff]/50 text-[#3b7eff]'
                : 'bg-[#111] border-[#222] text-[#555] hover:text-foreground'
            }`}
          >
            <Film className="w-3 h-3" />Scene Cards
          </button>
          <button
            onClick={() => setViewMode('review')}
            className={`flex items-center gap-2 font-mono text-xs px-3 py-1.5 rounded border transition-all ${
              viewMode === 'review'
                ? 'bg-[#8b5cf6]/20 border-[#8b5cf6]/50 text-[#8b5cf6]'
                : 'bg-[#111] border-[#222] text-[#555] hover:text-foreground'
            }`}
          >
            <ListFilter className="w-3 h-3" />Review Mode
          </button>
        </div>
      )}

      {/* Scene Image Cards */}
      {viewMode === 'cards' && hasAnyImages && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sceneImages.map(img => (
            <SceneImageCard
              key={img.id}
              image={img}
              versions={versionMap[img.id] || []}
              prompt={getPromptForImage(img)}
              isGenerating={generatingIds.has(img.id)}
              realProvidersEnabled={realProvidersEnabled}
              providerActive={providerActive}
              providerEndpoint={providerEndpoint}
              project={project}
              styleBible={styleBible}
              characterSheet={characterSheet}
              envSheet={envSheet}
              onGenerate={handleGenerateSingleClick}
              onRegenerate={(sceneImageId, promptId) => {
                if (!realProvidersEnabled || !providerActive) {
                  toast.error('No real image provider connected. Upload an image manually to replace this one.', { duration: 5000 });
                  return;
                }
                setPendingCreditAction({ sceneImageId, promptId, mode: 'single' });
              }}
              onUpload={handleUpload}
              onCreatePlaceholder={handleCreatePlaceholder}
              onUsePlaceholderAsDraft={handleUsePlaceholderAsDraft}
              onApprove={handleApprove}
              onReject={handleReject}
              onCompare={setCompareTarget}
              onEditPrompt={handleEditPrompt}
              onSceneImageUpdate={(updated) => {
                setSceneImages(prev => {
                  const next = prev.map(si => si.id === updated.id ? updated : si);
                  onSceneImagesUpdate(next);
                  return next;
                });
              }}
              onAllApproved={() => {
                onProjectUpdate({ status: 'Ready for Motion', images_approved: true });
              }}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!hasAnyImages && (
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded p-8 text-center">
          <Film className="w-10 h-10 text-[#222] mx-auto mb-4" />
          <p className="font-mono text-sm text-[#555] mb-1">No scene images yet.</p>
          {realProvidersEnabled && providerActive ? (
            <p className="text-xs text-[#444]">Click "Generate All Scene Images" to call {providerName} for each scene.</p>
          ) : (
            <p className="text-xs text-[#444]">
              No provider connected. Connect one in Image Provider Settings above, or upload images manually / create placeholder previews for each scene below.
            </p>
          )}
        </div>
      )}

      {/* Review Mode */}
      {viewMode === 'review' && hasAnyImages && (
        <div>
          <button
            onClick={() => setShowReviewMode(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-[#111] border border-[#222] rounded font-mono text-xs text-[#8b5cf6] uppercase tracking-widest hover:border-[#333] transition-all mb-2"
          >
            Review All Scenes
            {showReviewMode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <ImageReviewMode
            images={sceneImages}
            versionMap={versionMap}
            prompts={prompts}
            generatingIds={generatingIds}
            onRegenerate={handleRegenerate}
            onApprove={handleApprove}
          />
        </div>
      )}

      {/* Consistency Controls */}
      <div>
        <button
          onClick={() => setShowControls(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-[#111] border border-[#222] rounded font-mono text-xs text-[#8b5cf6] uppercase tracking-widest hover:border-[#333] transition-all"
        >
          Consistency Controls
          {showControls ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showControls && (
          <div className="mt-2">
            <ConsistencyControls project={project} onChange={handleConsistencyChange} />
          </div>
        )}
      </div>

      {/* Ready for Motion */}
      {allImagesApproved && (
        <div className="bg-[#0a1a0d] border border-[#10b981]/40 rounded p-5 md:p-6 text-center space-y-3">
          <CheckCircle2 className="w-8 h-8 text-[#10b981] mx-auto" />
          <h3 className="font-mono text-base font-bold text-[#10b981]">All Scene Images Approved</h3>
          <p className="text-sm text-[#10b981]/70 leading-relaxed text-pretty">
            Your visual scenes are approved. BeatVision is now ready for motion and future video generation.
          </p>
          <div className="inline-flex items-center gap-2 bg-[#10b981]/20 border border-[#10b981]/30 rounded px-4 py-2">
            <Film className="w-4 h-4 text-[#10b981]" />
            <span className="font-mono text-sm text-[#10b981] font-bold">Ready for Motion</span>
          </div>
        </div>
      )}

      {/* Compare Versions Modal */}
      {compareTarget && (
        <CompareVersionsModal
          sceneImage={compareTarget}
          versions={versionMap[compareTarget.id] || []}
          onSelectVersion={handleSelectVersion}
          onClose={() => setCompareTarget(null)}
        />
      )}

      {/* Credit Safety Confirmation Dialog */}
      <AlertDialog
        open={!!pendingCreditAction}
        onOpenChange={(open) => { if (!open) setPendingCreditAction(null); }}
      >
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              This action uses external provider credits
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  You are about to call <span className="font-semibold text-foreground">{providerName}</span> to generate{' '}
                  {pendingCreditAction?.mode === 'all'
                    ? `images for all ${approvedPrompts.length} approved scene${approvedPrompts.length !== 1 ? 's' : ''}`
                    : 'an image for this scene'}.
                </p>
                <p className="text-[#777]">
                  This will send your scene prompts to the connected provider endpoint and may consume credits or incur costs depending on your provider plan.
                </p>
                <p className="text-[#777]">
                  No credits are used if you cancel. Manual upload and placeholder preview are always free.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingCreditAction(null)}>
              Cancel — do not use credits
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => {
                if (!pendingCreditAction) return;
                const action = pendingCreditAction;
                setPendingCreditAction(null);
                if (action.mode === 'all') {
                  handleGenerateAll();
                } else {
                  handleGenerateSingle(action.sceneImageId, action.promptId);
                }
              }}
            >
              Yes, use provider credits
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
