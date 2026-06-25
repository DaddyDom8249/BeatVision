import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImageIcon, Loader2, ShieldCheck, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prepareProviderOffSceneImages } from '@/lib/sceneImageProviderOff';
import type { SceneImage, SceneVisualPrompt, StoryboardScene } from '@/types/types';

type Props = {
  projectId?: string | null;
  scenePrompts?: SceneVisualPrompt[] | null;
  sceneImages?: SceneImage[] | null;
  storyboardScenes?: StoryboardScene[] | null;
  projectScenePromptsApproved?: boolean;
  realProvidersEnabled?: boolean;
  providerActive?: boolean;
  providerName?: string | null;
  onImagesUpdated?: (images: SceneImage[]) => void;
};

const arr = <T,>(value: T[] | null | undefined): T[] => Array.isArray(value) ? value : [];

const hasRealImageFile = (image: SceneImage): boolean =>
  // Strict: approval/manual/generated flags can be stale. Only URL/path proves a real image file exists.
  Boolean(image.image_url || image.storage_path);

export default function SceneImageGenerationSection({
  projectId,
  scenePrompts,
  sceneImages,
  storyboardScenes,
  projectScenePromptsApproved = false,
  realProvidersEnabled = false,
  providerActive = false,
  providerName = 'Manual Upload Only',
  onImagesUpdated,
}: Props) {
  const [working, setWorking] = useState(false);

  const promptRows = useMemo(() => arr(scenePrompts), [scenePrompts]);
  const imageRows = useMemo(() => arr(sceneImages), [sceneImages]);
  const storyboardRows = useMemo(() => arr(storyboardScenes), [storyboardScenes]);

  const explicitlyApprovedPrompts = useMemo(
    () => promptRows.filter((prompt) => Boolean(prompt.approved)),
    [promptRows],
  );

  const allStoryboardScenesApproved = useMemo(
    () => storyboardRows.length > 0 && storyboardRows.every((scene) => Boolean(scene.approved)),
    [storyboardRows],
  );

  const promptGateApproved =
    explicitlyApprovedPrompts.length > 0 ||
    Boolean(projectScenePromptsApproved) ||
    allStoryboardScenesApproved;

  const usablePrompts = useMemo(() => {
    if (explicitlyApprovedPrompts.length > 0) return explicitlyApprovedPrompts;
    if (promptGateApproved) return promptRows;
    return [];
  }, [explicitlyApprovedPrompts, promptGateApproved, promptRows]);

  const preparedCount = useMemo(
    () =>
      usablePrompts.filter((prompt) =>
        imageRows.some((image) => image.scene_visual_prompt_id === prompt.id || image.scene_number === prompt.scene_number),
      ).length,
    [usablePrompts, imageRows],
  );

  const realImageFileCount = useMemo(() => imageRows.filter(hasRealImageFile).length, [imageRows]);
  const providerIsSafeOff = !realProvidersEnabled || !providerActive;
  const canPrepare = Boolean(projectId) && usablePrompts.length > 0 && !working;

  const handlePrepareProviderOffImages = async () => {
    if (!projectId) {
      toast.error('Project is not loaded yet.');
      return;
    }

    if (!promptRows.length) {
      toast.error('Scene visual prompts have not been created yet.');
      return;
    }

    if (!promptGateApproved) {
      toast.error('Approval mismatch. Approve the scene prompt pack or storyboard scenes first.');
      return;
    }

    setWorking(true);

    try {
      const result = await prepareProviderOffSceneImages({
        projectId,
        scenePrompts: usablePrompts,
        existingSceneImages: imageRows,
        allowUnapprovedPrompts: true,
      });

      onImagesUpdated?.(result.images);
      toast.success(`Scene image slots ready: ${result.inserted} created, ${result.repaired} repaired, ${result.preserved} preserved.`);
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
                ? 'BeatVision will not call external image APIs. It prepares scene image records and waits for manual uploads.'
                : `Provider setting says ${providerName || 'unknown provider'} may be active, but this safe foundation does not call paid APIs yet.`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl bg-secondary/50 border border-border px-3 py-3">
            <p className="text-xs text-muted-foreground">Prompt rows</p>
            <p className="text-xl font-bold text-foreground">{promptRows.length}</p>
          </div>

          <div className="rounded-xl bg-secondary/50 border border-border px-3 py-3">
            <p className="text-xs text-muted-foreground">Approved gate</p>
            <p className="text-xl font-bold text-foreground">{promptGateApproved ? 'Yes' : 'No'}</p>
          </div>

          <div className="rounded-xl bg-secondary/50 border border-border px-3 py-3">
            <p className="text-xs text-muted-foreground">Image slots</p>
            <p className="text-xl font-bold text-foreground">{preparedCount}</p>
          </div>

          <div className="rounded-xl bg-secondary/50 border border-border px-3 py-3">
            <p className="text-xs text-muted-foreground">Real image files</p>
            <p className="text-xl font-bold text-foreground">{realImageFileCount}</p>
          </div>
        </div>

        {!promptRows.length ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground text-pretty">
              Scene visual prompts have not been created yet. Generate the Scene Visual Prompt Pack first.
            </p>
          </div>
        ) : !promptGateApproved ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground text-pretty">
              Approval mismatch detected. BeatVision sees {promptRows.length} prompt rows, {explicitlyApprovedPrompts.length} explicitly approved prompt rows, project approval {projectScenePromptsApproved ? 'true' : 'false'}, and storyboard approval {allStoryboardScenesApproved ? 'true' : 'false'}.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3 flex gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground text-pretty">
              Approval gate passed. BeatVision can prepare scene image slots for manual upload.
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
