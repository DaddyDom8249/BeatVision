/**
 * SceneImageOptionsPanel
 *
 * Handles the full flow for a single scene image:
 *   1. Upload reference image → scene_image_options + scene_images
 *   2. Choose variation count → Generate Options (credit-gated)
 *   3. Option grid → Use This Image
 *   4. Approve Selected Image → all-approved → Ready for Motion
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  Sparkles,
  CheckCircle2,
  Loader2,
  ImageIcon,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  SceneImage,
  SceneVisualPrompt,
  SceneImageOption,
  Project,
  WorldStyleBible,
  CharacterSheet,
  EnvironmentSheet,
} from '@/types/types';

const VARIATION_COUNTS = [2, 4, 6, 8] as const;
type VariationCount = (typeof VARIATION_COUNTS)[number];

interface Props {
  image: SceneImage;
  prompt: SceneVisualPrompt | null;
  project: Project;
  realProvidersEnabled: boolean;
  providerActive: boolean;
  providerEndpoint: string | null;
  styleBible: WorldStyleBible | null;
  characterSheet: CharacterSheet | null;
  envSheet: EnvironmentSheet | null;
  onSceneImageUpdate: (updated: SceneImage) => void;
  /** called when all images for project are approved */
  onAllApproved: () => void;
}

export default function SceneImageOptionsPanel({
  image,
  prompt,
  project,
  realProvidersEnabled,
  providerActive,
  providerEndpoint,
  styleBible,
  characterSheet,
  envSheet,
  onSceneImageUpdate,
  onAllApproved,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [options, setOptions] = useState<SceneImageOption[]>([]);
  const [variationCount, setVariationCount] = useState<VariationCount>(4);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const cloudflareWorkerBase = import.meta.env.VITE_CLOUDFLARE_AI_WORKER_URL?.trim?.() ?? '';
  const cloudflareWorkerEndpoint = cloudflareWorkerBase
    ? `${cloudflareWorkerBase.replace(/\/+$/, '')}/generate-image`
    : null;
  const activeProviderEndpoint = providerEndpoint || cloudflareWorkerEndpoint;
  const providerReady =
    realProvidersEnabled &&
    Boolean(activeProviderEndpoint) &&
    (providerActive || Boolean(cloudflareWorkerEndpoint));


  const loadOptions = useCallback(async () => {
    const { data } = await supabase
      .from('scene_image_options')
      .select('*')
      .eq('scene_image_id', image.id)
      .order('option_index', { ascending: true });
    if (Array.isArray(data)) setOptions(data as SceneImageOption[]);
  }, [image.id]);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  // ── Upload reference image ──────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const storagePath = `${project.id}/scene-${image.scene_number}/reference-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('scene-images')
        .upload(storagePath, file, { upsert: true });
      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

      const { data: urlData } = supabase.storage.from('scene-images').getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;
      const now = new Date().toISOString();

      // Deselect all existing options for this scene
      await supabase
        .from('scene_image_options')
        .update({ selected: false, updated_at: now })
        .eq('scene_image_id', image.id);

      // Upsert a manual_upload option (option_index 0 = reference)
      const { data: optRow, error: optErr } = await supabase
        .from('scene_image_options')
        .insert({
          project_id: project.id,
          scene_image_id: image.id,
          owner_id: (await supabase.auth.getUser()).data.user?.id ?? null,
          option_index: 0,
          source_type: 'manual_upload',
          provider: 'manual_upload',
          image_url: publicUrl,
          storage_path: storagePath,
          reference_image_url: publicUrl,
          status: 'ready',
          selected: true,
          prompt_text: prompt?.main_image_prompt ?? null,
          updated_at: now,
        })
        .select()
        .maybeSingle();

      if (optErr) throw new Error(`Failed to save option: ${optErr.message}`);

      // Update scene_images row
      const { error: siErr } = await supabase
        .from('scene_images')
        .update({
          image_url: publicUrl,
          storage_path: storagePath,
          provider_name: 'manual_upload',
          manual_upload: true,
          real_generated: false,
          placeholder: false,
          generation_status: 'uploaded',
          approved: false,
          updated_after_approval: false,
          updated_at: now,
        })
        .eq('id', image.id);
      if (siErr) throw new Error(`Failed to update scene image: ${siErr.message}`);

      // Refresh local state
      const updatedImage: SceneImage = {
        ...image,
        image_url: publicUrl,
        storage_path: storagePath,
        provider_name: 'manual_upload',
        manual_upload: true,
        real_generated: false,
        placeholder: false,
        generation_status: 'uploaded',
        approved: false,
        updated_after_approval: false,
      };
      onSceneImageUpdate(updatedImage);

      if (optRow) {
        setOptions(prev => {
          const filtered = prev.map(o => ({ ...o, selected: false }));
          return [{ ...optRow as SceneImageOption, selected: true }, ...filtered.filter(o => o.source_type !== 'manual_upload' || o.id !== optRow.id)];
        });
      }

      toast.success('Reference image uploaded.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  // ── Generate options via provider ───────────────────────────────────────────
  const handleGenerate = async () => {
    if (!providerReady || !activeProviderEndpoint) {
      toast.info(
        image.image_url
          ? 'Manual upload saved. Regenerated options require an image provider.'
          : 'No image provider connected. Upload a reference image manually.',
        { duration: 6000 }
      );
      return;
    }
    if (!prompt) {
      toast.error('No scene prompt found for this scene. Approve scene visual prompts first.');
      return;
    }

    setGenerating(true);
    const referenceUrl = image.image_url ?? null;
    const now = new Date().toISOString();

    // Clear old generated AI options before creating new ones.
    // Keep manual/reference options so user uploads are not touched.
    await supabase
      .from('scene_image_options')
      .delete()
      .eq('scene_image_id', image.id)
      .neq('source_type', 'manual_upload');

    const generated: SceneImageOption[] = [];
    const failures: string[] = [];

    for (let i = 0; i < variationCount; i++) {
      try {
        const projectSeed =
          Array.from(project.id || 'beatvision-project').reduce(
            (acc, ch) => acc + ch.charCodeAt(0),
            0
          ) || 12345;

        const sceneText = [
          (prompt as any).scene_title ?? `Scene ${prompt.scene_number}`,
          (prompt as any).scene_description ?? '',
          (prompt as any).visual_prompt ?? '',
          prompt.main_image_prompt ?? '',
        ].filter(Boolean).join(' ');

        const body = {
          prompt: [
            'Full-color photoreal cinematic music-video still frame.',
            'Real camera look, gritty realism, 16:9 movie frame, not a sketch, not a model sheet, not concept art.',
            `Song/project: ${project.title ?? 'Drain Rack Halo'}.`,
            'World: rainy Alabama LKQ pick-your-part auto salvage yard, mud, stripped cars, wire harnesses, drain rack, industrial metal, floodlights, wet work clothes.',
            'Protagonist: female salvage-yard worker / auto dismantling worker in neon yellow reflective safety vest, grounded workwear, tattooed forearms when visible.',
            'The protagonist must be physically inside the salvage-yard scene doing the action.',
            sceneText,
          ].filter(Boolean).join(' '),

          negative_prompt: [
            prompt.negative_prompt ?? '',
            'character turnaround',
            'character model sheet',
            'reference sheet',
            'orthographic view',
            'front side back view',
            'T-pose',
            'blank white background',
            'white studio background',
            'empty hallway',
            'empty corridor',
            'architecture concept',
            'environment-only image',
            'no protagonist',
            'comic panel',
            'cartoon',
            'anime',
            'illustration',
            'sketch',
            'line art',
            'grayscale sketch',
            'blueprint',
            'wireframe',
            'stained glass border',
            'storybook frame',
            'fashion editorial',
            'glamour photoshoot',
            'futuristic showroom',
            'neon car show',
            'toy figure',
            '3D mannequin',
            'different protagonist',
            'different outfit',
            'different world',
            'text',
            'watermark',
            'logo'
          ].filter(Boolean).join(', '),

          aspect_ratio: '16:9',
          output_size: '1024x576',
          width: 1024,
          height: 576,
          num_steps: 20,
          guidance: 8.5,
          model_name: '',

          project_id: project.id,
          project_title: project.title ?? '',
          scene_number: prompt.scene_number,
          scene_title: (prompt as any).scene_title ?? `Scene ${prompt.scene_number}`,

          reference_image_url: referenceUrl,

          style_bible: styleBible ? JSON.stringify(styleBible) : '',
          character_sheet: characterSheet ? JSON.stringify(characterSheet) : '',
          environment_sheet: envSheet ? JSON.stringify(envSheet) : '',

          consistency_mode: 'locked',
          project_seed: projectSeed,
          seed: projectSeed + Number(prompt.scene_number ?? 0) * 100 + i,

          variation_index: i,
          variation_total: variationCount,

          anchor_summary:
            (characterSheet as any)?.identity_lock ||
            (characterSheet as any)?.summary ||
            'Same female salvage-yard worker, reflective safety vest, grounded workwear, muddy industrial setting.',

          world_summary:
            (envSheet as any)?.world_identity_lock ||
            (envSheet as any)?.summary ||
            'Rainy Alabama auto salvage yard, stripped cars, wire harnesses, drain rack, mud, puddles, metal, floodlights.',

          reference_notes:
            'Generate an actual scene from the song world. Do not create a character sheet, model sheet, comic panel, empty corridor, or environment-only concept image.',
        };

        const requestEndpoint = (() => {
          const raw = activeProviderEndpoint.trim();

          try {
            const url = new URL(raw);

            // Cloudflare Worker may be saved as the base URL by mistake.
            // Route it to /generate-image automatically.
            if (
              url.hostname.endsWith('workers.dev') &&
              (url.pathname === '/' || url.pathname === '')
            ) {
              url.pathname = '/generate-image';
              return url.toString();
            }
          } catch {
            // Keep raw endpoint if parsing fails.
          }

          return raw;
        })();

        const res = await fetch(requestEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Provider returned ${res.status}: ${errText}`);
        }
        const contentType = res.headers.get('content-type') || '';
        let resolvedUrl: string | null = null;
        let resolvedStoragePath: string | null = null;

        const uploadGeneratedBlob = async (blob: Blob, ext: 'jpg' | 'png' | 'webp' = 'jpg') => {
          const path = `${project.id}/scene-${image.scene_number}/option-${i + 1}-${Date.now()}.${ext}`;
          const { error: blobErr } = await supabase.storage
            .from('scene-images')
            .upload(path, blob, {
              upsert: true,
              contentType: blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            });

          if (blobErr) {
            throw new Error(`Generated image upload failed: ${blobErr.message}`);
          }

          resolvedStoragePath = path;
          resolvedUrl = supabase.storage.from('scene-images').getPublicUrl(path).data.publicUrl;
        };

        if (contentType.startsWith('image/')) {
          const blob = await res.blob();
          const ext =
            contentType.includes('png') ? 'png' :
            contentType.includes('webp') ? 'webp' :
            'jpg';

          await uploadGeneratedBlob(blob, ext);
        } else {
          const json = await res.json();

          if (json.ok === false) {
            throw new Error(json.error || json.details || 'Provider returned an error.');
          }

          if (json.image_url) {
            resolvedUrl = json.image_url as string;
          } else if (json.base64 || json.data || json.image) {
            let b64 = json.base64 || json.data || json.image;
            if (typeof b64 === 'string' && b64.includes(',')) {
              b64 = b64.split(',').pop();
            }

            const byteStr = atob(b64);
            const arr = new Uint8Array(byteStr.length);
            for (let j = 0; j < byteStr.length; j++) arr[j] = byteStr.charCodeAt(j);

            const blob = new Blob([arr], { type: 'image/png' });
            await uploadGeneratedBlob(blob, 'png');
          }
        }

        if (!resolvedUrl) continue;

        const { data: optRow } = await supabase
          .from('scene_image_options')
          .insert({
            project_id: project.id,
            scene_image_id: image.id,
            owner_id: (await supabase.auth.getUser()).data.user?.id ?? null,
            option_index: i + 1,
            source_type: 'ai_generated',
            provider: activeProviderEndpoint.includes('workers.dev') ? 'cloudflare_workers_ai' : 'provider',
            image_url: resolvedUrl,
            storage_path: resolvedStoragePath,
            reference_image_url: referenceUrl,
            status: 'ready',
            selected: false,
            prompt_text: prompt.main_image_prompt ?? null,
            updated_at: new Date().toISOString(),
          })
          .select()
          .maybeSingle();

        if (optRow) generated.push(optRow as SceneImageOption);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Variation ${i + 1} failed:`, err);
        failures.push(`Variation ${i + 1}: ${message}`);
        toast.error(`Variation ${i + 1} failed: ${message}`);
      }
    }

    await loadOptions();

    if (generated.length === 0) {
      const lastFailure = failures.length ? ` Last error: ${failures[failures.length - 1]}` : '';
      toast.warning(`No variations were returned by the provider.${lastFailure}`);
    } else {
      toast.success(`${generated.length} of ${variationCount} image options generated. Tap "Use This Image" to select one.`);
    }
    setGenerating(false);
  };

  // ── Use This Image ──────────────────────────────────────────────────────────
  const handleUseOption = async (option: SceneImageOption) => {
    if (!option.image_url) return;
    setSelectingId(option.id);
    const now = new Date().toISOString();

    try {
      // Deselect all
      await supabase
        .from('scene_image_options')
        .update({ selected: false, updated_at: now })
        .eq('scene_image_id', image.id);

      // Select chosen
      await supabase
        .from('scene_image_options')
        .update({ selected: true, updated_at: now })
        .eq('id', option.id);

      // Update scene_images
      const isManual = option.source_type === 'manual_upload';
      const { error: siErr } = await supabase
        .from('scene_images')
        .update({
          image_url: option.image_url,
          storage_path: option.storage_path ?? null,
          provider_name: option.provider ?? 'manual_upload',
          manual_upload: isManual,
          real_generated: !isManual,
          placeholder: false,
          generation_status: 'selected',
          approved: false,
          updated_after_approval: false,
          updated_at: now,
        })
        .eq('id', image.id);

      if (siErr) throw new Error(siErr.message);

      setOptions(prev =>
        prev.map(o => ({ ...o, selected: o.id === option.id }))
      );

      const updatedImage: SceneImage = {
        ...image,
        image_url: option.image_url,
        storage_path: option.storage_path ?? null,
        provider_name: option.provider ?? 'manual_upload',
        manual_upload: isManual,
        real_generated: !isManual,
        placeholder: false,
        generation_status: 'selected',
        approved: false,
        updated_after_approval: false,
      };
      onSceneImageUpdate(updatedImage);
      toast.success('Image selected for this scene.');
    } catch (err) {
      toast.error(`Failed to select image: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSelectingId(null);
    }
  };

  // ── Approve Selected Image ──────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!image.image_url) {
      toast.error('Select an image before approving.');
      return;
    }
    setApproving(true);
    const now = new Date().toISOString();
    try {
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
        .eq('id', image.id);

      const updatedImage: SceneImage = {
        ...image,
        approved: true,
        rejected: false,
        generation_status: 'approved',
        needs_review: false,
        updated_after_approval: false,
        pending: false,
        last_approved_at: now,
      };
      onSceneImageUpdate(updatedImage);
      toast.success('Scene image approved.');

      // Check all approved for project
      const { count } = await supabase
        .from('scene_images')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('approved', false);

      if ((count ?? 0) === 0) {
        await supabase
          .from('projects')
          .update({ images_approved: true, status: 'Ready for Motion', updated_at: now })
          .eq('id', project.id);
        onAllApproved();
        toast.success('All scene images approved! Your project is Ready for Motion.', { duration: 5000 });
      }
    } catch (err) {
      toast.error(`Approval failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setApproving(false);
    }
  };

  const selectedOption = options.find(o => o.selected);
  const hasImage = !!image.image_url;
  const canApprove = hasImage && !image.approved;
  return (
    <div className="border-t border-[#1a1a1a] bg-[#0d0d0d] p-4 space-y-4">
      {/* ── Header label ── */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#555]">Image Options</p>
        {image.approved && (
          <Badge className="bg-[#10b981]/20 text-[#10b981] border-[#10b981]/30 font-mono text-[10px]">
            APPROVED
          </Badge>
        )}
      </div>

      {/* ── No-provider notice ── */}
      {!providerReady && (
        <div className="flex items-start gap-2 rounded px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a]">
          <AlertTriangle className="w-3 h-3 text-yellow-500/70 mt-0.5 shrink-0" />
          <p className="text-[11px] text-[#666] leading-relaxed">
            <span className="text-foreground/50 font-medium">Manual upload required. No image provider connected.</span>
            {' '}Upload a reference image below. Regenerated options will become available once a provider is configured.
          </p>
        </div>
      )}

      {/* ── Upload reference image ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="ghost"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="text-[#3b7eff] hover:text-blue-300 border border-[#3b7eff]/30 font-mono text-xs h-7"
        >
          {uploading
            ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Uploading…</>
            : <><Upload className="w-3 h-3 mr-1.5" />{hasImage ? 'Replace Reference Image' : 'Upload Reference Image'}</>
          }
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* ── Variation count + generate ── */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] text-[#555] uppercase tracking-widest">Variation Count</p>
        <div className="flex items-center gap-2 flex-wrap">
          {VARIATION_COUNTS.map(n => (
            <button
              key={n}
              onClick={() => setVariationCount(n)}
              className={`font-mono text-xs px-3 py-1 rounded border transition-all ${
                variationCount === n
                  ? 'bg-[#8b5cf6]/20 border-[#8b5cf6]/50 text-[#a78bfa]'
                  : 'bg-[#111] border-[#222] text-[#555] hover:border-[#333] hover:text-[#888]'
              }`}
            >
              {n}
            </button>
          ))}

          <Button
            size="sm"
            disabled={generating || !hasImage}
            onClick={handleGenerate}
            title={!hasImage ? 'Upload a reference image first' : !providerReady ? 'No provider connected — options will not be generated' : undefined}
            className={`font-mono text-xs h-7 ml-1 ${
              providerReady
                ? 'bg-[#8b5cf6] hover:bg-[#7c3aed] text-white'
                : 'bg-[#1a1a1a] border border-[#333] text-[#555] cursor-not-allowed'
            }`}
          >
            {generating
              ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Generating…</>
              : <><Sparkles className="w-3 h-3 mr-1.5" />Generate {variationCount} Options</>
            }
          </Button>
        </div>
        {!hasImage && (
          <p className="text-[10px] text-[#444] font-mono">Upload a reference image first to enable generation.</p>
        )}
      </div>

      {/* ── Option grid ── */}
      {options.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] text-[#555] uppercase tracking-widest">
            {options.length} Option{options.length !== 1 ? 's' : ''}
            {selectedOption ? ' · 1 Selected' : ''}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {options.map(opt => {
              const isSelected = opt.selected;
              const isSelecting = selectingId === opt.id;
              return (
                <div
                  key={opt.id}
                  className={`relative rounded overflow-hidden border transition-all ${
                    isSelected
                      ? 'border-[#10b981]/60 ring-1 ring-[#10b981]/40'
                      : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
                  }`}
                >
                  {/* Image */}
                  {opt.image_url ? (
                    <div className="aspect-video w-full overflow-hidden bg-[#111]">
                      <img
                        src={opt.image_url}
                        alt={`Option ${opt.option_index ?? ''}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video w-full flex items-center justify-center bg-[#111]">
                      <ImageIcon className="w-6 h-6 text-[#333]" />
                    </div>
                  )}

                  {/* Source badge */}
                  <div className="absolute top-1 left-1">
                    {opt.source_type === 'manual_upload' ? (
                      <Badge className="bg-[#3b7eff]/80 text-white border-0 font-mono text-[9px] px-1.5 py-0">
                        REF
                      </Badge>
                    ) : (
                      <Badge className="bg-[#8b5cf6]/80 text-white border-0 font-mono text-[9px] px-1.5 py-0">
                        AI
                      </Badge>
                    )}
                  </div>

                  {/* Selected checkmark */}
                  {isSelected && (
                    <div className="absolute top-1 right-1">
                      <CheckCircle2 className="w-4 h-4 text-[#10b981] drop-shadow" />
                    </div>
                  )}

                  {/* Use This Image button */}
                  <div className="p-1.5">
                    <Button
                      size="sm"
                      disabled={isSelecting || !opt.image_url || isSelected}
                      onClick={() => handleUseOption(opt)}
                      className={`w-full font-mono text-[10px] h-6 ${
                        isSelected
                          ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30 cursor-default'
                          : 'bg-[#1a1a1a] hover:bg-[#222] text-[#888] hover:text-foreground border border-[#333]'
                      }`}
                    >
                      {isSelecting
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : isSelected
                        ? <><CheckCircle2 className="w-3 h-3 mr-1" />Selected</>
                        : 'Use This Image'
                      }
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Current selected image preview (if no options yet but image_url set) ── */}
      {hasImage && options.length === 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] text-[#555] uppercase tracking-widest">Current Image</p>
          <div className="aspect-video w-full max-w-xs overflow-hidden rounded border border-[#2a2a2a] bg-[#111]">
            <img src={image.image_url!} alt="Current scene" className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      {/* ── Approve Selected Image ── */}
      <div className="flex items-center gap-3 pt-1 border-t border-[#1a1a1a]">
        {canApprove ? (
          <Button
            size="sm"
            disabled={approving}
            onClick={handleApprove}
            className="bg-[#10b981]/20 hover:bg-[#10b981]/30 text-[#10b981] border border-[#10b981]/30 font-mono text-xs h-7"
          >
            {approving
              ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Approving…</>
              : <><CheckCircle2 className="w-3 h-3 mr-1.5" />Approve Selected Image</>
            }
          </Button>
        ) : image.approved ? (
          <div className="flex items-center gap-1.5 text-[#10b981] font-mono text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Image approved
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[#555] font-mono text-[10px]">
            <RefreshCw className="w-3 h-3" />
            Upload or select an image above to enable approval
          </div>
        )}
      </div>
    </div>
  );
}
