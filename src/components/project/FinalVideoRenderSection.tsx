import { useState, useRef, useCallback } from 'react';
import {
  Film, Download, Loader2, AlertCircle, CheckCircle2, RefreshCw, Play, HelpCircle, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  Project, MotionClip, SceneImage, StoryboardScene, MotionSettings,
  FinalVideo, VideoRenderJob, SceneMotionPlan,
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
  finalVideo: FinalVideo | null;
  renderJob: VideoRenderJob | null;
  onFinalVideoUpdate: (v: FinalVideo) => void;
  onRenderJobUpdate: (j: VideoRenderJob) => void;
  onProjectUpdate: (p: Partial<Project>) => void;
}

type RenderStep =
  | 'idle' | 'checking' | 'collecting_frames'
  | 'compositing' | 'encoding' | 'saving'
  | 'complete' | 'failed';

const STEP_LABELS: Record<RenderStep, string> = {
  idle: '',
  checking: 'Checking readiness…',
  collecting_frames: 'Collecting approved scene frames…',
  compositing: 'Compositing motion effects and captions…',
  encoding: 'Encoding video…',
  saving: 'Saving final video…',
  complete: 'Render complete!',
  failed: 'Render failed.',
};

interface Blocker { label: string; detail: string }

function getRenderBlockers(
  plans: SceneMotionPlan[],
  clips: MotionClip[],
  motionSettings: MotionSettings | null,
): Blocker[] {
  const blockers: Blocker[] = [];

  if (!motionSettings?.approved) {
    blockers.push({ label: 'Motion settings not saved', detail: 'Configure and save Motion Style Settings first.' });
  }

  const included = plans.filter((p) => p.include_in_final_video !== false);
  for (const plan of included) {
    const clip = clips.find((c) => c.scene_motion_plan_id === plan.id || c.scene_number === plan.scene_number);
    if (!clip) {
      blockers.push({
        label: `Scene ${plan.scene_number} has no motion clip`,
        detail: `Generate a motion clip for Scene ${plan.scene_number}${plan.scene_title ? ` — "${plan.scene_title}"` : ''}.`,
      });
    } else if (clip.generation_status === 'not_generated' || clip.generation_status === 'failed') {
      blockers.push({
        label: `Scene ${plan.scene_number} motion clip is ${clip.generation_status === 'failed' ? 'failed' : 'not generated'}`,
        detail: `Regenerate the motion clip for Scene ${plan.scene_number}.`,
      });
    }
  }

  return blockers;
}

// Canvas-based WebM rendering using MediaRecorder
async function renderWebMFromScenes(
  clips: MotionClip[],
  sceneImages: SceneImage[],
  motionSettings: MotionSettings | null,
  onStep: (s: RenderStep) => void,
): Promise<Blob | null> {
  onStep('collecting_frames');

  // Accept approved OR ready_for_review (fallback clips)
  const renderableClips = clips
    .filter((c) => c.approved || c.generation_status === 'ready_for_review')
    .sort((a, b) => a.scene_number - b.scene_number);

  if (renderableClips.length === 0) return null;

  const imageMap: Record<number, HTMLImageElement> = {};
  await Promise.all(
    renderableClips.map((clip) => {
      const img = sceneImages.find((i) => i.scene_number === clip.scene_number && i.approved);
      if (!img?.image_url) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload  = () => { imageMap[clip.scene_number] = el; resolve(); };
        el.onerror = () => resolve();
        el.src = img.image_url!;
      });
    })
  );

  onStep('compositing');

  const W = 1280, H = 720;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  if (!window.MediaRecorder) return null;

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9' : 'video/webm';
  const stream   = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  return new Promise<Blob | null>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      resolve(blob.size > 1000 ? blob : null);
    };

    recorder.start(100);
    onStep('encoding');

    let clipIdx = 0;
    let clipStartTime: number | null = null;
    let rafId: number;

    const renderFrame = (ts: number) => {
      if (clipIdx >= renderableClips.length) { recorder.stop(); return; }

      const clip = renderableClips[clipIdx];
      if (!clipStartTime) clipStartTime = ts;
      const elapsed  = (ts - clipStartTime) / 1000;
      const duration = clip.duration ?? 4;
      const progress = Math.min(elapsed / duration, 1);
      const ease     = progress < 0.5 ? 2*progress*progress : 1 - Math.pow(-2*progress+2,2)/2;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      const img = imageMap[clip.scene_number];
      if (img) {
        let scale = 1, ox = 0, oy = 0;
        switch (clip.motion_effect) {
          case 'Slow Zoom In':  scale = 1 + ease*0.12; break;
          case 'Slow Zoom Out': scale = 1.12 - ease*0.12; break;
          case 'Pan Left':  ox = -ease*W*0.07; scale = 1.08; break;
          case 'Pan Right': ox =  ease*W*0.07; scale = 1.08; break;
          case 'Tilt Up':   oy = -ease*H*0.07; scale = 1.08; break;
          case 'Tilt Down': oy =  ease*H*0.07; scale = 1.08; break;
          case 'Beat Pulse': scale = 1 + Math.abs(Math.sin(progress*Math.PI*4))*0.04; break;
          case 'Subtle Shake': ox = Math.sin(progress*Math.PI*14)*4; oy = Math.cos(progress*Math.PI*14)*3; break;
          default: break;
        }
        const dw = W*scale, dh = H*scale;
        const dx = (W-dw)/2 + ox, dy = (H-dh)/2 + oy;
        const fadeIn  = Math.min(progress*6, 1);
        const fadeOut = Math.min((1-progress)*6, 1);
        ctx.globalAlpha = Math.min(fadeIn, fadeOut);
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.globalAlpha = 1;
      }

      if (clip.caption_text) {
        const capProg = Math.min((progress-0.08)*5, 1);
        if (capProg > 0) {
          ctx.globalAlpha = capProg;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(0, H-60, W, 60);
          ctx.font = `bold ${Math.round(W*0.035)}px system-ui,sans-serif`;
          ctx.fillStyle = '#f0f0ff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const t = clip.caption_text.length > 60 ? clip.caption_text.slice(0,57)+'…' : clip.caption_text;
          ctx.fillText(t, W/2, H-30);
          ctx.globalAlpha = 1;
        }
      }

      if (progress >= 1) { clipIdx++; clipStartTime = null; }
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    setTimeout(() => {
      cancelAnimationFrame(rafId);
      if (recorder.state !== 'inactive') recorder.stop();
    }, 300_000);
  });
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FinalVideoRenderSection({
  project, scenes, plans, clips, sceneImages, motionSettings, finalVideo,
  renderJob, onFinalVideoUpdate, onRenderJobUpdate, onProjectUpdate,
}: Props) {
  const [renderStep, setRenderStep]     = useState<RenderStep>('idle');
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [outputBlobUrl, setOutputBlobUrl] = useState<string | null>(finalVideo?.video_url ?? null);
  const [showBlockers, setShowBlockers] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Use ready_for_review OR approved clips for render (fallback clips are valid)
  const renderableClips = clips.filter((c) => c.approved || c.generation_status === 'ready_for_review');
  const renderBlockers   = getRenderBlockers(plans, clips, motionSettings);

  // Can render if no hard blockers (audio is optional)
  const canRender = renderBlockers.length === 0 && renderableClips.length > 0 && !!motionSettings;

  const handleRender = useCallback(async () => {
    setErrorMsg(null);
    setRenderStep('checking');

    // Exact blocker check — show specific issues not vague messages
    if (!motionSettings) {
      setErrorMsg('Motion settings not saved. Save Motion Style Settings first.');
      setRenderStep('failed');
      return;
    }
    if (renderableClips.length === 0) {
      setErrorMsg('No motion clips found. Generate motion clips for each scene first.');
      setRenderStep('failed');
      return;
    }
    if (renderBlockers.length > 0) {
      setErrorMsg(`Cannot render: ${renderBlockers.map((b) => b.label).join(' · ')}`);
      setRenderStep('failed');
      return;
    }

    let job: VideoRenderJob | null = null;
    try {
      // Create render job record
      const { data: jd, error: je } = await supabase
        .from('video_render_jobs')
        .insert({
          project_id: project.id,
          render_type: 'final',
          status: 'running',
          video_format: motionSettings.video_format,
          video_quality: motionSettings.video_quality,
          started_at: new Date().toISOString(),
        })
        .select().maybeSingle();
      if (je) throw je;
      job = jd as VideoRenderJob;
      onRenderJobUpdate(job);

      // Try canvas → WebM render
      const supportsRecorder = typeof window !== 'undefined' && !!window.MediaRecorder;
      let blob: Blob | null = null;
      let format = 'in-app';

      if (supportsRecorder) {
        blob = await renderWebMFromScenes(clips, sceneImages, motionSettings, setRenderStep);
        if (blob) format = 'video/webm';
      } else {
        setRenderStep('encoding');
      }

      setRenderStep('saving');

      let videoUrl: string | null = null;
      if (blob) {
        videoUrl = URL.createObjectURL(blob);
        setOutputBlobUrl(videoUrl);
      }

      const fvData = {
        project_id: project.id,
        title: project.title,
        video_url: videoUrl,
        preview_video_url: videoUrl,
        audio_file: project.song_file,
        duration: renderableClips.reduce((s, c) => s + (c.duration ?? 4), 0),
        format,
        quality: motionSettings.video_quality,
        render_status: 'complete' as const,
        downloadable: !!blob,
      };

      let fv: FinalVideo;
      if (finalVideo) {
        const { data, error } = await supabase.from('final_videos')
          .update({ ...fvData, updated_at: new Date().toISOString() })
          .eq('id', finalVideo.id).select().maybeSingle();
        if (error) throw error;
        fv = data as FinalVideo;
      } else {
        const { data, error } = await supabase.from('final_videos').insert(fvData).select().maybeSingle();
        if (error) throw error;
        fv = data as FinalVideo;
      }

      const { data: updJob } = await supabase.from('video_render_jobs')
        .update({ status: 'complete', output_url: videoUrl, completed_at: new Date().toISOString() })
        .eq('id', job!.id).select().maybeSingle();
      if (updJob) onRenderJobUpdate(updJob as VideoRenderJob);

      await supabase.from('projects').update({ status: 'Final Video Rendered' }).eq('id', project.id);
      onProjectUpdate({ status: 'Final Video Rendered' });
      onFinalVideoUpdate(fv);

      setRenderStep('complete');
      if (blob) {
        toast.success('Music video rendered as WebM! Download available below.');
      } else {
        toast.success('Preview video rendered. Add audio to your browser to include the song. MP4 export enabled when server rendering is connected.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error during rendering.';
      setErrorMsg(msg);
      setRenderStep('failed');
      await supabase.from('projects').update({ status: 'Render Failed' }).eq('id', project.id);
      onProjectUpdate({ status: 'Render Failed' });
      if (job) {
        await supabase.from('video_render_jobs')
          .update({ status: 'failed', error_message: msg })
          .eq('id', job.id);
      }
      toast.error('Video rendering failed. See details below.');
    }
  }, [
    renderableClips, clips, motionSettings, project, sceneImages, plans,
    finalVideo, renderJob, renderBlockers, onFinalVideoUpdate, onRenderJobUpdate, onProjectUpdate,
  ]);

  const handleDownload = () => {
    if (!outputBlobUrl) return;
    const a = document.createElement('a');
    a.href = outputBlobUrl;
    a.download = `${project.title.replace(/[^a-z0-9]/gi, '-')}-beatvision.webm`;
    a.click();
  };

  const isRendering = (['checking','collecting_frames','compositing','encoding','saving'] as RenderStep[]).includes(renderStep);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Film className="w-4 h-4 text-emerald-400" />
        <p className="text-xs font-mono text-muted-foreground/50 uppercase tracking-widest">
          Render Final Music Video
        </p>
      </div>

      <p className="text-sm text-muted-foreground/70">
        Render one complete music video using approved scene images and canvas motion effects.
        Fallback canvas clips are fully supported. WebM renders in your browser — MP4 export available when server rendering is connected.
        {!project.song_file && (
          <span className="block mt-1 text-amber-400/70 text-xs">
            Note: No audio file uploaded. Video will render without audio. Upload a song file to include music.
          </span>
        )}
      </p>

      {/* Why Can't I Render? */}
      {renderBlockers.length > 0 && (
        <div>
          <button
            onClick={() => setShowBlockers((v) => !v)}
            className="flex items-center gap-2 text-xs text-amber-400/80 hover:text-amber-400 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Why Can't I Render? ({renderBlockers.length} blocker{renderBlockers.length > 1 ? 's' : ''})
            <ChevronDown className={`w-3 h-3 transition-transform ${showBlockers ? 'rotate-180' : ''}`} />
          </button>
          {showBlockers && (
            <div
              className="mt-3 rounded-2xl p-4 space-y-2"
              style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)' }}
            >
              <p className="text-xs font-mono text-red-400/80 uppercase tracking-wider mb-2">Render Blockers</p>
              {renderBlockers.map((b, i) => (
                <div key={i} className="flex items-start gap-3">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-300">{b.label}</p>
                    <p className="text-[11px] text-muted-foreground/55">{b.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {renderBlockers.length === 0 && renderableClips.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {renderableClips.length} clip{renderableClips.length > 1 ? 's' : ''} ready to render.{!project.song_file ? ' (No audio file — video only)' : ''}
        </div>
      )}

      {/* Render progress */}
      {isRendering && (
        <div
          className="rounded-2xl px-5 py-4 flex items-center gap-3"
          style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">{STEP_LABELS[renderStep]}</p>
            <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)', width: '220px' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  background: '#e5a93c',
                  width: `${(['checking','collecting_frames','compositing','encoding','saving'].indexOf(renderStep as string)+1)*20}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Error state with exact message */}
      {renderStep === 'failed' && errorMsg && (
        <div
          className="rounded-2xl p-4 space-y-2"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-sm font-semibold text-red-300">Render Failed</p>
          </div>
          <p className="text-xs text-muted-foreground/60 pl-6">{errorMsg}</p>
        </div>
      )}

      {/* Complete state */}
      {renderStep === 'complete' && (
        <div
          className="rounded-2xl p-4 flex items-center gap-3"
          style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)' }}
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-bold text-emerald-400">Video Rendered!</p>
            <p className="text-xs text-muted-foreground/60">
              {outputBlobUrl
                ? 'Preview video rendered as WebM. MP4 export will be available when server rendering is connected.'
                : 'In-app preview rendered. Server rendering will enable full MP4 export.'}
            </p>
          </div>
        </div>
      )}

      {/* Video player */}
      {outputBlobUrl && (
        <div className="space-y-2">
          <video
            ref={videoRef}
            src={outputBlobUrl}
            controls
            className="w-full rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(16,185,129,0.25)', background: '#000' }}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => videoRef.current?.play()}
              className="h-8 text-xs gap-1.5"
              style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.30)', color: '#c4b5fd' }}
            >
              <Play className="w-3 h-3" /> Play
            </Button>
            <Button
              size="sm"
              onClick={handleDownload}
              className="h-8 text-xs gap-1.5"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.30)', color: '#6ee7b7' }}
            >
              <Download className="w-3 h-3" /> Download WebM
            </Button>
          </div>
        </div>
      )}

      {/* Render button */}
      <Button
        onClick={handleRender}
        disabled={isRendering || !canRender}
        className="w-full h-12 font-bold text-sm"
        style={{
          background: isRendering
            ? 'rgba(255,255,255,0.05)'
            : canRender
            ? 'linear-gradient(135deg, rgba(16,185,129,0.22) 0%, rgba(6,182,212,0.22) 100%)'
            : 'rgba(255,255,255,0.04)',
          border: canRender ? '1px solid rgba(16,185,129,0.45)' : '1px solid rgba(255,255,255,0.10)',
          color: isRendering ? '#6b7280' : canRender ? '#6ee7b7' : 'rgb(100,100,100)',
        }}
      >
        {isRendering ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{STEP_LABELS[renderStep]}</>
        ) : renderStep === 'failed' ? (
          <><RefreshCw className="w-4 h-4 mr-2" />Retry Render</>
        ) : renderStep === 'complete' ? (
          <><RefreshCw className="w-4 h-4 mr-2" />Re-render Music Video</>
        ) : (
          <><Film className="w-4 h-4 mr-2" />Render Final Music Video</>
        )}
      </Button>

      {!canRender && renderBlockers.length === 0 && (
        <p className="text-xs text-center text-muted-foreground/40">
          {!motionSettings ? 'Save motion settings to unlock rendering.' : 'Generate motion clips to unlock rendering.'}
        </p>
      )}
    </div>
  );
}
