import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImageIcon, Loader2, ShieldCheck, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prepareProviderOffSceneImages } from '@/lib/sceneImageProviderOff';
import type { SceneImage, SceneVisualPrompt, StoryboardScene } from '@/types/types';

type Props = {
  projectId: string;
  scenePrompts: SceneVisualPrompt[];
  sceneImages: SceneImage[];
  storyboardScenes?: StoryboardScene[];
  projectScenePromptsApproved?: boolean;
  realProvidersEnabled?: boolean;
  providerActive?: boolean;
  providerName?: string | null;
  onImagesUpdated: (images: SceneImage[]) => void;
};

const hasUsableImage = (image: SceneImage): boolean =>
  // Strict: approval/manual flags do not prove an image file exists.
  Boolean(image.image_url || image.storage_path);

export default function SceneImageGenerationSection({
  projectId,
  scenePrompts,
  sceneImages,
  storyboardScenes = [],
  projectScenePromptsApproved = false,
  realProvidersEnabled = false,
  providerActive = false,
  providerName = 'Manual Upload Only',
  onImagesUpdated,
}: Props) {
  const [working, setWorking] = useState(false);

  const explicitlyApprovedPrompts = useMemo(
    () => scenePrompts.filter((prompt) => Boolean(prompt.approved)),
    [scenePrompts],
  );

  const allStoryboardScenesApproved = useMemo(
    () => storyboardScenes.length > 0 && storyboardScenes.every((scene) => Boolean(scene.approved)),
    [storyboardScenes],
  );

  const promptGateApproved =
    explicitlyApprovedPrompts.length > 0 ||
    projectScenePromptsApproved ||
    allStoryboardScenesApproved;

  const usablePrompts = useMemo(() => {
    if (explicitlyApprovedPrompts.length > 0) return explicitlyApprovedPrompts;
    if (promptGateApproved) return scenePrompts;
    return [];
  }, [explicitlyApprovedPrompts, promptGateApproved, scenePrompts]);

  const preparedCount = useMemo(
    () =>
      usablePrompts.filter((prompt) =>
        sceneImages.some((image) => image.scene_visual_prompt_id === prompt.id || image.scene_number === prompt.scene_number),
      ).length,
    [usablePrompts, sceneImages],
  );

  const usableImageCount = useMemo(() => sceneImages.filter(hasUsableImage).length, [sceneImages]);
  const providerIsSafeOff = !realProvidersEnabled || !providerActive;
  const canPrepare = Boolean(projectId) && usablePrompts.length > 0 && !working;

  const handlePrepareProviderOffImages = async () => {
    if (!projectId) {
      toast.error('Project is not loaded yet.');
      return;
    }

    if (!scenePrompts.length) {
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
        existingSceneImages: sceneImages,
        allowUnapprovedPrompts: true,
      });

      onImagesUpdated(result.images);
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
                ? 'BeatVision will not call external image APIs. It will prepare real scene image records and wait for manual uploads.'
                : `Provider setting says ${providerName || 'unknown provider'} may be active, but this safe foundation does not call paid APIs yet.`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl bg-secondary/50 border border-border px-3 py-3">
            <p className="text-xs text-muted-foreground">Prompt rows</p>
            <p className="text-xl font-bold text-foreground">{scenePrompts.length}</p>
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
            <p className="text-xl font-bold text-foreground">{usableImageCount}</p>
          </div>
        </div>

        {!scenePrompts.length ? (
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
              Approval mismatch detected. BeatVision sees {scenePrompts.length} prompt rows, {explicitlyApprovedPrompts.length} explicitly approved prompt rows, project approval {projectScenePromptsApproved ? 'true' : 'false'}, and storyboard approval {allStoryboardScenesApproved ? 'true' : 'false'}.
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
