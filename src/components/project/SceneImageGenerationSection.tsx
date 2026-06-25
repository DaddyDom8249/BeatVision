import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImageIcon, Loader2, ShieldCheck, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prepareProviderOffSceneImages } from '@/lib/sceneImageProviderOff';
import type { SceneImage, SceneVisualPrompt } from '@/types/types';

type Props = {
  projectId: string;
  scenePrompts: SceneVisualPrompt[];
  sceneImages: SceneImage[];
  realProvidersEnabled?: boolean;
  providerActive?: boolean;
  providerName?: string | null;
  onImagesUpdated: (images: SceneImage[]) => void;
};

const hasUsableImage = (image: SceneImage): boolean => {
  return Boolean(
    image.approved ||
    image.image_url ||
    image.storage_path ||
    image.manual_upload ||
    image.real_generated,
  );
};

export default function SceneImageGenerationSection({
  projectId,
  scenePrompts,
  sceneImages,
  realProvidersEnabled = false,
  providerActive = false,
  providerName = 'Manual Upload Only',
  onImagesUpdated,
}: Props) {
  const [working, setWorking] = useState(false);

  const approvedPrompts = useMemo(
    () => scenePrompts.filter((prompt) => Boolean(prompt.approved)),
    [scenePrompts],
  );

  const preparedCount = useMemo(() => {
    return approvedPrompts.filter((prompt) => {
      return sceneImages.some((image) => (
        image.scene_visual_prompt_id === prompt.id ||
        image.scene_number === prompt.scene_number
      ));
    }).length;
  }, [approvedPrompts, sceneImages]);

  const usableImageCount = useMemo(
    () => sceneImages.filter(hasUsableImage).length,
    [sceneImages],
  );

  const providerIsSafeOff = !realProvidersEnabled || !providerActive;
  const canPrepare = Boolean(projectId) && approvedPrompts.length > 0 && !working;

  const handlePrepareProviderOffImages = async () => {
    if (!projectId) {
      toast.error('Project is not loaded yet.');
      return;
    }

    if (!approvedPrompts.length) {
      toast.error('Approve scene visual prompts first.');
      return;
    }

    setWorking(true);

    try {
      const result = await prepareProviderOffSceneImages({
        projectId,
        scenePrompts,
        existingSceneImages: sceneImages,
      });

      onImagesUpdated(result.images);

      toast.success(
        `Scene image slots ready: ${result.inserted} created, ${result.repaired} repaired, ${result.preserved} preserved.`,
      );
    } catch (error) {
      console.error('[BeatVision Phase 3] Failed to prepare scene image slots:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to prepare scene image slots.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <ImageIcon className="w-4 h-4" />
          Phase 3 — Scene Image Generation
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div
          className="rounded-xl border px-4 py-3 flex items-start gap-3"
          style={
            providerIsSafeOff
              ? { background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.25)' }
              : { background: 'rgba(245,158,11,0.07)', borderColor: 'rgba(245,158,11,0.28)' }
          }
        >
          {providerIsSafeOff ? (
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          )}

          <div className="space-y-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {providerIsSafeOff ? 'Credit-safe provider-off mode' : 'Real provider switch detected'}
            </p>
            <p className="text-xs text-muted-foreground text-pretty">
              {providerIsSafeOff
                ? 'BeatVision will not call external image APIs. It will prepare real scene image records from approved prompts and wait for manual uploads.'
                : `Provider setting says ${providerName || 'unknown provider'} may be active, but this safe Phase 3 foundation does not call paid APIs yet.`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl bg-secondary/50 border border-border px-3 py-3">
            <p className="text-xs text-muted-foreground">Scene prompts</p>
            <p className="text-xl font-bold text-foreground">{scenePrompts.length}</p>
          </div>

          <div className="rounded-xl bg-secondary/50 border border-border px-3 py-3">
            <p className="text-xs text-muted-foreground">Approved prompts</p>
            <p className="text-xl font-bold text-foreground">{approvedPrompts.length}</p>
          </div>

          <div className="rounded-xl bg-secondary/50 border border-border px-3 py-3">
            <p className="text-xs text-muted-foreground">Image slots</p>
            <p className="text-xl font-bold text-foreground">{preparedCount}</p>
          </div>

          <div className="rounded-xl bg-secondary/50 border border-border px-3 py-3">
            <p className="text-xs text-muted-foreground">Uploaded/approved</p>
            <p className="text-xl font-bold text-foreground">{usableImageCount}</p>
          </div>
        </div>

        {approvedPrompts.length === 0 ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground text-pretty">
              Approve scene visual prompts first. Phase 3 uses approved prompts only, because letting random unapproved prompts generate the visual world would be very on-brand for chaos, not for BeatVision.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3 flex gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground text-pretty">
              Approved scene prompts are ready. Prepare scene image slots, then upload images manually for each scene.
            </p>
          </div>
        )}

        <Button
          type="button"
          onClick={handlePrepareProviderOffImages}
          disabled={!canPrepare}
          className="w-full h-11 font-semibold"
        >
          {working ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Preparing Scene Image Slots...
            </>
          ) : (
            <>
              <UploadCloud className="w-4 h-4 mr-2" />
              Prepare Scene Images for Manual Upload
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
