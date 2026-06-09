import { useState } from 'react';
import { CheckCircle2, Circle, AlertCircle, RefreshCw, Clapperboard, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Project, StoryboardScene, SceneImage, MotionSettings, MotionClip, SceneMotionPlan } from '@/types/types';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';

interface Props {
  project: Project;
  scenes: StoryboardScene[];
  sceneImages: SceneImage[];
  motionSettings: MotionSettings | null;
  motionClips: MotionClip[];
  motionPlans: SceneMotionPlan[];
  onProjectUpdate: (p: Partial<Project>) => void;
  onClipsUpdate?: (clips: MotionClip[]) => void;
  onPlansUpdate?: (plans: SceneMotionPlan[]) => void;
}

interface Blocker { label: string; detail: string }

const STEPS = [
  'World Approved',
  'Storyboard Approved',
  'Characters Approved',
  'World Assets Approved',
  'Scene Prompts Approved',
  'Scene Images Approved',
  'Motion Settings Ready',
  'Preview Render Ready',
  'Final Video Rendered',
];

function getMotionBlockers(
  project: Project,
  scenes: StoryboardScene[],
  sceneImages: SceneImage[],
  motionSettings: MotionSettings | null,
): Blocker[] {
  const blockers: Blocker[] = [];
  if (!project.world_approved)          blockers.push({ label: 'Visual World Report not approved', detail: 'Approve the Visual World Report before generating motion.' });
  if (!project.storyboard_approved)     blockers.push({ label: 'Storyboard not approved', detail: 'Approve the storyboard before generating motion.' });
  if (!project.characters_approved)     blockers.push({ label: 'Characters & Environment not approved', detail: 'Approve Characters and Environment before generating motion.' });
  if (!project.style_bible_approved)    blockers.push({ label: 'World Style Bible not approved', detail: 'Approve the World Style Bible before generating motion.' });
  if (!project.character_sheet_approved) blockers.push({ label: 'Character Sheet not approved', detail: 'Approve the Character Sheet before generating motion.' });
  if (!project.environment_sheet_approved) blockers.push({ label: 'Environment Sheet not approved', detail: 'Approve the Environment Sheet before generating motion.' });
  if (!project.scene_prompts_approved)  blockers.push({ label: 'Scene Visual Prompts not approved', detail: 'Approve all Scene Visual Prompts before generating motion.' });

  const approvedScenes = scenes.filter((s) => s.approved);
  for (const scene of approvedScenes) {
    const img = sceneImages.find(
      (i) => (i.storyboard_scene_id === scene.id || i.scene_number === scene.scene_number) && i.approved
    );
    if (!img) {
      blockers.push({
        label: `Scene ${scene.scene_number} image not approved`,
        detail: scene.scene_title
          ? `"${scene.scene_title}" — approve a scene image before rendering motion.`
          : `Scene ${scene.scene_number} needs an approved image.`,
      });
    }
  }

  if (!motionSettings) blockers.push({ label: 'Motion settings not saved', detail: 'Configure and save Motion Style Settings before generating motion.' });
  return blockers;
}

function getPreviewRenderBlockers(
  project: Project,
  plans: SceneMotionPlan[],
  motionSettings: MotionSettings | null,
  motionClips: MotionClip[],
): Blocker[] {
  const blockers: Blocker[] = [];
  if (!motionSettings?.approved) blockers.push({ label: 'Motion settings not saved', detail: 'Save Motion Style Settings first.' });

  const included = plans.filter((p) => p != null && p.include_in_final_video !== false);
  for (const plan of included) {
    const clip = motionClips.find((c) => c.scene_motion_plan_id === plan.id || c.scene_number === plan.scene_number);
    if (!clip) {
      blockers.push({
        label: `Scene ${plan.scene_number} has no motion clip`,
        detail: `Generate a motion clip for Scene ${plan.scene_number}${plan.scene_title ? ` — "${plan.scene_title}"` : ''}.`,
      });
    } else if (clip.generation_status === 'not_generated' || clip.generation_status === 'failed') {
      blockers.push({
        label: `Scene ${plan.scene_number} motion clip failed or not generated`,
        detail: `Regenerate the motion clip for Scene ${plan.scene_number}.`,
      });
    }
  }

  if (!project.song_file) {
    blockers.push({
      label: 'Audio file missing (optional)',
      detail: 'Upload a song file if you want audio in your final render. Not required to proceed.',
    });
  }

  return blockers;
}

export default function MotionReadinessSection({
  project, scenes, sceneImages, motionSettings, motionClips, motionPlans,
  onProjectUpdate, onClipsUpdate, onPlansUpdate,
}: Props) {
  const [checking,  setChecking]  = useState(false);
  const [cleaning,  setCleaning]  = useState(false);
  const [checked,   setChecked]   = useState(false);

  const baseBlockers   = getMotionBlockers(project, scenes, sceneImages, motionSettings);
  const renderBlockers = getPreviewRenderBlockers(project, motionPlans, motionSettings, motionClips);

  const stepsDone = [
    project.world_approved,
    project.storyboard_approved,
    project.characters_approved,
    project.style_bible_approved && project.character_sheet_approved && project.environment_sheet_approved,
    project.scene_prompts_approved,
    project.images_approved,
    !!motionSettings?.approved,
    project.status === 'Preview Render Ready' || project.status === 'Final Video Rendered',
    project.status === 'Final Video Rendered',
  ];

  // Cleanup stale pending/failed states on all approved records
  const runCleanup = async () => {
    setCleaning(true);
    try {
      const now = new Date().toISOString();

      // Clear stale flags on approved motion clips
      const { data: updatedClips } = await supabase
        .from('motion_clips')
        .update({ pending: false, failed: false, needs_review: false, updated_after_approval: false, updated_at: now })
        .eq('project_id', project.id)
        .eq('approved', true)
        .select();

      // Clear stale flags on approved motion plans
      const { data: updatedPlans } = await supabase
        .from('scene_motion_plans')
        .update({ pending: false, failed: false, needs_review: false, updated_after_approval: false, updated_at: now })
        .eq('project_id', project.id)
        .eq('approved', true)
        .select();

      // Clear stale flags on approved scene images
      await supabase
        .from('scene_images')
        .update({ needs_review: false, updated_after_approval: false })
        .eq('project_id', project.id)
        .eq('approved', true);

      if (updatedClips && onClipsUpdate) {
        onClipsUpdate(motionClips.map((c) => {
          const fresh = (updatedClips as MotionClip[]).find((u) => u.id === c.id);
          return fresh ?? c;
        }));
      }

      if (updatedPlans && onPlansUpdate) {
        onPlansUpdate(motionPlans.map((p) => {
          const fresh = (updatedPlans as SceneMotionPlan[]).find((u) => u.id === p.id);
          return fresh ?? p;
        }));
      }

      toast.success('Stale pending and failed states cleared successfully.');
    } catch {
      toast.error('Cleanup failed. Please try again.');
    } finally {
      setCleaning(false);
    }
  };

  const handleCheckReadiness = async () => {
    setChecking(true);
    try {
      await runCleanup();

      const blockers = getMotionBlockers(project, scenes, sceneImages, motionSettings);
      if (blockers.length === 0) {
        const newStatus = 'Ready for Motion' as const;
        await supabase.from('projects').update({ status: newStatus }).eq('id', project.id);
        onProjectUpdate({ status: newStatus });
        toast.success('All clear! Project is ready for motion generation.');
      } else {
        toast.error(`${blockers.length} blocker${blockers.length > 1 ? 's' : ''} found. See the list below.`);
      }
    } catch {
      toast.error('Failed to check readiness. Please try again.');
    } finally {
      setChecking(false);
      setChecked(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress tracker */}
      <div
        className="rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <p className="text-xs font-mono text-muted-foreground/50 uppercase tracking-widest mb-4">
          Motion Readiness Tracker
        </p>
        <div className="space-y-2">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              {stepsDone[i] ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <Circle className="w-4 h-4 shrink-0 text-muted-foreground/30" />
              )}
              <span className={`text-sm ${stepsDone[i] ? 'text-foreground/90' : 'text-muted-foreground/50'}`}>
                {step}
              </span>
              {stepsDone[i] && <span className="ml-auto text-[10px] font-mono text-emerald-400/70">✓</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Buttons row */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleCheckReadiness}
          disabled={checking || cleaning}
          className="flex-1 h-11 font-bold"
          style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.20) 0%, rgba(139,92,246,0.20) 100%)',
            border: '1px solid rgba(99,102,241,0.40)',
            color: '#c4b5fd',
          }}
        >
          {checking ? (
            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Checking…</>
          ) : (
            <><Clapperboard className="w-4 h-4 mr-2" />Check Motion Readiness</>
          )}
        </Button>
        <Button
          onClick={runCleanup}
          disabled={cleaning || checking}
          className="h-11 px-4 font-semibold text-xs"
          style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', color: '#fcd34d' }}
        >
          {cleaning ? (
            <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Cleaning…</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Clear Stale States</>
          )}
        </Button>
      </div>

      {/* Base blockers */}
      {checked && baseBlockers.length > 0 && (
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-bold text-amber-400">
              {baseBlockers.length} Blocker{baseBlockers.length > 1 ? 's' : ''} Found
            </p>
          </div>
          {baseBlockers.map((b, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 text-[10px] font-bold"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#fcd34d' }}>
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-amber-300">{b.label}</p>
                <p className="text-xs text-muted-foreground/60">{b.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {checked && baseBlockers.length === 0 && (
        <div
          className="rounded-2xl p-4 flex items-center gap-3"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-bold text-emerald-400">No blockers found.</p>
            <p className="text-xs text-muted-foreground/60">Motion generation is available.</p>
          </div>
        </div>
      )}

      {/* Render blockers — shown when clips exist */}
      {renderBlockers.length > 0 && motionClips.length > 0 && (
        <div
          className="rounded-2xl p-4 space-y-2"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)' }}
        >
          <p className="text-xs font-mono text-red-400/80 uppercase tracking-wider mb-2">
            Why Can't I Render? — {renderBlockers.length} blocker{renderBlockers.length > 1 ? 's' : ''}
          </p>
          {renderBlockers.map((b, i) => (
            <div key={i} className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-300">{b.label}</p>
                <p className="text-xs text-muted-foreground/60">{b.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {motionClips.length > 0 && renderBlockers.filter((b) => !b.label.includes('optional')).length === 0 && (
        <div
          className="rounded-2xl p-3 flex items-center gap-2"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)' }}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-xs text-emerald-300">All render requirements met. Preview and render are unlocked.</p>
        </div>
      )}
    </div>
  );
}
