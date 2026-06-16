import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Lock, Unlock, ImageIcon, CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  project: any;
  segment: any;
  sceneImages: any[];
  onSegmentUpdated?: (updatedSegment: any) => void;
}

function getImageUrl(img: any): string | null {
  return img?.image_url || img?.scene_image_url || img?.reference_image_url || img?.placeholder_url || null;
}

function labelForImage(img: any, index: number): string {
  const source =
    img?.manual_upload ? 'Manual' :
    img?.real_generated ? 'AI' :
    img?.use_placeholder_as_draft_final ? 'Placeholder' :
    img?.provider_name || img?.provider || 'Image';

  const scene =
    img?.scene_number ??
    img?.scene_index ??
    img?.segment_number ??
    index + 1;

  return `${source} · Scene ${scene}`;
}

export default function SegmentImageOverridePanel({
  project,
  segment,
  sceneImages,
  onSegmentUpdated,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const candidateImages = useMemo(() => {
    const withUrls = (sceneImages || [])
      .filter((img: any) => !!getImageUrl(img))
      .filter((img: any) =>
        img.approved ||
        img.manual_upload ||
        img.real_generated ||
        img.use_placeholder_as_draft_final
      );

    const seen = new Set<string>();
    return withUrls.filter((img: any) => {
      const url = getImageUrl(img);
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }, [sceneImages]);

  const updateSegment = async (payload: any, successMessage: string) => {
    if (!segment?.id) {
      toast.error('Segment id missing. Cannot update this segment.');
      return;
    }

    setBusy(true);
    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('video_segments')
        .update({
          ...payload,
          locked: true,
          updated_at: now,
        })
        .eq('id', segment.id)
        .select()
        .maybeSingle();

      if (error) throw new Error(error.message);

      toast.success(successMessage);
      if (data && onSegmentUpdated) onSegmentUpdated(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update segment image.');
    } finally {
      setBusy(false);
    }
  };

  const useSceneImage = async (img: any) => {
    const url = getImageUrl(img);
    if (!url) return;

    await updateSegment(
      {
        image_url: url,
        scene_image_url: url,
        storage_path: img.storage_path ?? null,
        image_path: img.storage_path ?? null,
        image_source: img.manual_upload ? 'manual_scene_image' : 'ai_scene_image',
        source_scene_image_id: img.id ?? null,
        source_storyboard_scene_id: img.storyboard_scene_id ?? img.source_storyboard_scene_id ?? null,
        scene_visual_prompt_id: img.scene_visual_prompt_id ?? null,
        source_scene_visual_prompt_id: img.scene_visual_prompt_id ?? null,
      },
      `Segment ${segment.segment_number ?? ''} image locked.`
    );
  };

  const uploadSegmentImage = async (e: any) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const safeSegment = segment.segment_number ?? segment.segment_index ?? 'unknown';
      const storagePath = `${project.id}/segment-overrides/segment-${safeSegment}-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('scene-images')
        .upload(storagePath, file, {
          upsert: true,
          contentType: file.type || 'image/jpeg',
        });

      if (uploadErr) throw new Error(uploadErr.message);

      const publicUrl = supabase.storage.from('scene-images').getPublicUrl(storagePath).data.publicUrl;

      await updateSegment(
        {
          image_url: publicUrl,
          scene_image_url: publicUrl,
          storage_path: storagePath,
          image_path: storagePath,
          image_source: 'segment_upload',
          source_scene_image_id: null,
          source_type: 'segment_override_upload',
        },
        `Uploaded and locked image for segment ${safeSegment}.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Segment upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const unlockSegment = async () => {
    if (!segment?.id) return;

    setBusy(true);
    try {
      const { data, error } = await supabase
        .from('video_segments')
        .update({
          locked: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', segment.id)
        .select()
        .maybeSingle();

      if (error) throw new Error(error.message);

      toast.success(`Segment ${segment.segment_number ?? ''} unlocked.`);
      if (data && onSegmentUpdated) onSegmentUpdated(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unlock segment.');
    } finally {
      setBusy(false);
    }
  };

  const currentUrl = segment.image_url || segment.scene_image_url || null;

  return (
    <div className="mt-3 rounded-xl border border-border/60 bg-black/20 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 text-sm font-mono text-muted-foreground hover:text-foreground"
        >
          <ImageIcon className="w-4 h-4" />
          Segment Image Control
          {segment.locked && (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
              Locked
            </Badge>
          )}
        </button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={segment.locked ? unlockSegment : () => setOpen(true)}
          className="h-8"
        >
          {segment.locked ? (
            <>
              <Unlock className="w-3.5 h-3.5 mr-1.5" />
              Unlock
            </>
          ) : (
            <>
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              Lock
            </>
          )}
        </Button>
      </div>

      {currentUrl && (
        <div className="text-xs text-muted-foreground font-mono">
          Current segment image: {segment.image_source || 'scene image'}
        </div>
      )}

      {open && (
        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={uploadSegmentImage}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-1.5" />
              Upload Segment Image
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Done
            </Button>
          </div>

          {candidateImages.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No approved scene images found. Upload one directly for this segment.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {candidateImages.map((img: any, idx: number) => {
                const url = getImageUrl(img);
                const selected = url && currentUrl === url;

                return (
                  <div
                    key={img.id || `${url}-${idx}`}
                    className={`rounded-lg border overflow-hidden bg-background/50 ${
                      selected ? 'border-emerald-500' : 'border-border'
                    }`}
                  >
                    {url && (
                      <img
                        src={url}
                        alt={labelForImage(img, idx)}
                        className="w-full h-24 object-cover"
                      />
                    )}

                    <div className="p-2 space-y-2">
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {labelForImage(img, idx)}
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || selected}
                        onClick={() => useSceneImage(img)}
                        className="w-full h-8"
                        variant={selected ? 'secondary' : 'outline'}
                      >
                        {busy ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            Saving
                          </>
                        ) : selected ? (
                          'Selected'
                        ) : (
                          'Use For Segment'
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
