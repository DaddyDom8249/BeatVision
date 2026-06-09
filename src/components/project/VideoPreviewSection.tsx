import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Play, Pause, RotateCcw, ChevronLeft, ChevronRight,
  Maximize2, Loader2, Film, Music2, CheckCircle2, AlertCircle, HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  Project, StoryboardScene, MotionClip, SceneImage, MotionSettings,
  VideoRenderJob, SceneMotionPlan,
} from '@/types/types';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';

interface Props {
  project: Project;
  scenes: StoryboardScene[];
  plans: SceneMotionPlan[];
  clips: MotionClip[];
  sceneImages: SceneImage[];
  motionSettings: MotionSettings | null;
  renderJob: VideoRenderJob | null;
  onRenderJobUpdate: (job: VideoRenderJob) => void;
  onProjectUpdate: (p: Partial<Project>) => void;
}

interface Blocker { label: string; detail: string }

function getPreviewBlockers(
  plans: SceneMotionPlan[],
  clips: MotionClip[],
  motionSettings: MotionSettings | null,
): Blocker[] {
  const blockers: Blocker[] = [];
  if (!motionSettings?.approved) {
    blockers.push({ label: 'Motion settings not saved', detail: 'Save Motion Style Settings first.' });
  }
  const included = plans.filter((p) => p.include_in_final_video !== false);
  for (const plan of included) {
    if (!plan.approved) {
      blockers.push({
        label: `Scene ${plan.scene_number} motion plan not approved`,
        detail: plan.scene_title ? `"${plan.scene_title}" — approve the plan first.` : `Approve Scene ${plan.scene_number}'s motion plan.`,
      });
    }
    const clip = clips.find((c) => c.scene_motion_plan_id === plan.id || c.scene_number === plan.scene_number);
    if (!clip) {
      blockers.push({
        label: `Scene ${plan.scene_number} has no motion clip`,
        detail: `Generate a motion clip for Scene ${plan.scene_number}.`,
      });
    }
  }
  return blockers;
}

// ── In-app preview player ─────────────────────────────────────────────────────

function InAppPreviewPlayer({
  scenes, clips, sceneImages, audioUrl, motionSettings,
}: {
  scenes: StoryboardScene[];
  clips: MotionClip[];
  sceneImages: SceneImage[];
  audioUrl: string | null;
  motionSettings: MotionSettings | null;
}) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Accept ready_for_review OR approved — fallback clips count as valid
  const playableClips = clips
    .filter((c) => c.approved || c.generation_status === 'ready_for_review')
    .sort((a, b) => a.scene_number - b.scene_number);

  const current = playableClips[sceneIndex];
  const currentScene = scenes.find((s) => s.scene_number === current?.scene_number);
  const currentImg = sceneImages.find(
    (i) => i.scene_number === current?.scene_number && i.approved
  );
  const sceneDuration = (current?.duration ?? 4) * 1000;
  const totalDuration = playableClips.reduce((s, c) => s + (c.duration ?? 4), 0);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setSceneIndex((prev) => {
        if (prev >= playableClips.length - 1) {
          stopTimer(); setPlaying(false);
          if (audioRef.current) audioRef.current.pause();
          return prev;
        }
        return prev + 1;
      });
    }, sceneDuration);
  }, [playableClips.length, sceneDuration, stopTimer]);

  const handlePlay  = () => { setPlaying(true);  startTimer(); audioRef.current?.play().catch(() => {}); };
  const handlePause = () => { setPlaying(false); stopTimer();  audioRef.current?.pause(); };
  const handleRestart = () => {
    stopTimer(); setPlaying(false); setSceneIndex(0);
    if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.pause(); }
  };
  const handlePrev = () => { stopTimer(); setPlaying(false); setSceneIndex((p) => Math.max(0, p-1)); };
  const handleNext = () => { stopTimer(); setPlaying(false); setSceneIndex((p) => Math.min(playableClips.length-1, p+1)); };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen?.(); 
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => () => stopTimer(), [stopTimer]);

  if (playableClips.length === 0) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <Film className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground/50">Generate motion clips first to preview the full video.</p>
      </div>
    );
  }

  const elapsedSec = playableClips.slice(0, sceneIndex).reduce((s, c) => s + (c.duration ?? 4), 0);
  const fmt = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  const aspectStyle = motionSettings?.video_format === '9:16 Vertical' ? '9/16'
    : motionSettings?.video_format === '1:1 Square' ? '1/1' : '16/9';

  return (
    <div ref={containerRef} className="rounded-2xl overflow-hidden" style={{ background: '#000', border: '1px solid rgba(139,92,246,0.25)' }}>
      {/* Scene display */}
      <div className="relative" style={{ aspectRatio: aspectStyle, maxHeight: '420px' }}>
        {currentImg?.image_url ? (
          <img
            src={currentImg.image_url}
            alt={currentScene?.scene_title ?? ''}
            className="w-full h-full object-cover"
            style={{ animation: playing ? 'slowZoom 4s ease-in-out infinite alternate' : 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
            <Film className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}

        {current?.caption_text && (
          <div className="absolute bottom-0 inset-x-0 py-3 px-4 text-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <p className="text-sm font-medium text-white">{current.caption_text}</p>
          </div>
        )}

        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.6)', color: '#c4b5fd' }}>
            {String(current?.scene_number ?? 0).padStart(2,'0')} / {playableClips.length}
          </span>
          {currentScene?.scene_title && (
            <span className="text-[10px] px-2 py-1 rounded-full truncate max-w-[200px]" style={{ background: 'rgba(0,0,0,0.6)', color: '#f0f0f0' }}>
              {currentScene.scene_title}
            </span>
          )}
          {current?.fallback_generated && (
            <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'rgba(139,92,246,0.25)', color: '#c4b5fd' }}>Fallback</span>
          )}
        </div>

        <div className="absolute top-3 right-3">
          <span className="text-[10px] font-mono px-2 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.6)' }}>
            {fmt(elapsedSec)} / {fmt(totalDuration)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-px px-2 py-1.5 bg-black/80">
        {playableClips.map((_, i) => (
          <div
            key={i}
            onClick={() => { handlePause(); setSceneIndex(i); }}
            className="flex-1 h-0.5 rounded-full cursor-pointer"
            style={{ background: i === sceneIndex ? '#8b5cf6' : i < sceneIndex ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.15)' }}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 px-4 py-3 bg-black/80">
        {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}
        <button onClick={handlePrev} disabled={sceneIndex === 0} className="p-1.5 rounded text-muted-foreground hover:text-white disabled:opacity-30">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {playing ? (
          <button onClick={handlePause} className="p-2 rounded-lg" style={{ background: 'rgba(139,92,246,0.20)', color: '#c4b5fd' }}>
            <Pause className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={handlePlay} className="p-2 rounded-lg" style={{ background: 'rgba(139,92,246,0.20)', color: '#c4b5fd' }}>
            <Play className="w-4 h-4" />
          </button>
        )}
        <button onClick={handleRestart} className="p-1.5 rounded text-muted-foreground hover:text-white">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleNext} disabled={sceneIndex >= playableClips.length-1} className="p-1.5 rounded text-muted-foreground hover:text-white disabled:opacity-30">
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        {audioUrl && <Music2 className="w-3.5 h-3.5 text-blue-400" />}
        <button onClick={toggleFullscreen} className="p-1.5 rounded text-muted-foreground hover:text-white">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <style>{`@keyframes slowZoom { from { transform: scale(1); } to { transform: scale(1.06); } }`}</style>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function VideoPreviewSection({
  project, scenes, plans, clips, sceneImages, motionSettings, renderJob,
  onRenderJobUpdate, onProjectUpdate,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [showBlockers, setShowBlockers] = useState(false);

  // Cleanup stale pending states before preview
  const cleanupStaleStates = async () => {
    const now = new Date().toISOString();
    await supabase.from('motion_clips').update({ pending: false, failed: false, needs_review: false, updated_after_approval: false, updated_at: now })
      .eq('project_id', project.id).eq('approved', true);
    await supabase.from('scene_motion_plans').update({ pending: false, failed: false, needs_review: false, updated_after_approval: false, updated_at: now })
      .eq('project_id', project.id).eq('approved', true);
  };

  // Accept clips that are ready_for_review OR approved (fallback clips count)
  const playableClips = clips.filter((c) => c.approved || c.generation_status === 'ready_for_review');
  const included      = plans.filter((p) => p.include_in_final_video !== false);

  // Can generate preview if any included scene has a clip ready
  const canGenerate = playableClips.length > 0;

  const previewBlockers = getPreviewBlockers(included, clips, motionSettings);
  const hasBlockers = previewBlockers.length > 0;

  const handleGeneratePreview = async () => {
    setGenerating(true);
    try {
      await cleanupStaleStates();

      const jobData = {
        project_id: project.id,
        render_type: 'preview' as const,
        status: 'complete' as const,
        video_format: motionSettings?.video_format ?? '16:9 Landscape',
        video_quality: motionSettings?.video_quality ?? 'Draft Preview',
        output_url: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };

      let job: VideoRenderJob;
      if (renderJob) {
        const { data, error } = await supabase.from('video_render_jobs')
          .update({ ...jobData, updated_at: new Date().toISOString() })
          .eq('id', renderJob.id).select().maybeSingle();
        if (error) throw error;
        job = data as VideoRenderJob;
      } else {
        const { data, error } = await supabase.from('video_render_jobs').insert(jobData).select().maybeSingle();
        if (error) throw error;
        job = data as VideoRenderJob;
      }

      await supabase.from('projects').update({ status: 'Preview Render Ready' }).eq('id', project.id);
      onProjectUpdate({ status: 'Preview Render Ready' });
      onRenderJobUpdate(job);
      toast.success(`Preview ready! ${playableClips.length} scene${playableClips.length > 1 ? 's' : ''} loaded. Use controls to play your music video.`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate preview. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Film className="w-4 h-4 text-violet-400" />
        <p className="text-xs font-mono text-muted-foreground/50 uppercase tracking-widest">
          Full Music Video Preview
        </p>
      </div>

      <p className="text-sm text-muted-foreground/70">
        Combine all motion clips into a playable preview with your song audio, captions, and transitions.
        Fallback canvas clips are fully supported — no real AI video required.
      </p>

      {/* Blocker help toggle */}
      {hasBlockers && (
        <button
          onClick={() => setShowBlockers((v) => !v)}
          className="flex items-center gap-2 text-xs text-amber-400/80 hover:text-amber-400 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Why is preview blocked? ({previewBlockers.length} issue{previewBlockers.length > 1 ? 's' : ''})
          {showBlockers ? '▲' : '▼'}
        </button>
      )}

      {showBlockers && hasBlockers && (
        <div
          className="rounded-2xl p-4 space-y-2"
          style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.22)' }}
        >
          <p className="text-xs font-mono text-amber-400/80 uppercase tracking-wider mb-2">
            Preview Blockers
          </p>
          {previewBlockers.map((b, i) => (
            <div key={i} className="flex items-start gap-3">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-300">{b.label}</p>
                <p className="text-[11px] text-muted-foreground/55">{b.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!hasBlockers && included.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          No blockers — preview is ready to generate.
        </div>
      )}

      <Button
        onClick={handleGeneratePreview}
        disabled={generating || !canGenerate}
        className="w-full h-11 font-bold"
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.20) 0%, rgba(59,130,246,0.20) 100%)',
          border: '1px solid rgba(99,102,241,0.40)',
          color: '#c4b5fd',
        }}
      >
        {generating ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating Preview…</>
        ) : (
          <><Film className="w-4 h-4 mr-2" />Generate Preview Video</>
        )}
      </Button>

      {!canGenerate && (
        <p className="text-xs text-muted-foreground/50 text-center">
          Generate motion clips first — use the Motion Clip Generation section above.
        </p>
      )}

      {/* In-app preview player — shows automatically when clips are ready */}
      {(renderJob || playableClips.length > 0) && (
        <InAppPreviewPlayer
          scenes={scenes}
          clips={clips}
          sceneImages={sceneImages}
          audioUrl={project.song_file}
          motionSettings={motionSettings}
        />
      )}
    </div>
  );
}
