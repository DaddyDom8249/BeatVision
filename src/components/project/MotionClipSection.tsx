import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play, Pause, RefreshCw, CheckCircle2, Loader2, Film,
  Zap, Settings2, AlertCircle, ChevronDown, ChevronUp, HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  Project, SceneMotionPlan, SceneImage, MotionClip, MotionSettings,
} from '@/types/types';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';

interface Props {
  project: Project;
  plans: SceneMotionPlan[];
  sceneImages: SceneImage[];
  motionSettings: MotionSettings | null;
  clips: MotionClip[];
  onClipsUpdate: (clips: MotionClip[]) => void;
  onProjectUpdate: (p: Partial<Project>) => void;
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  not_generated:    { bg: 'rgba(255,255,255,0.04)',  border: 'rgba(255,255,255,0.10)',  text: 'rgb(115,115,115)' },
  generating:       { bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.30)',   text: '#fbbf24' },
  ready_for_review: { bg: 'rgba(59,130,246,0.08)',   border: 'rgba(59,130,246,0.30)',   text: '#93c5fd' },
  approved:         { bg: 'rgba(16,185,129,0.06)',   border: 'rgba(16,185,129,0.25)',   text: '#6ee7b7' },
  failed:           { bg: 'rgba(239,68,68,0.08)',    border: 'rgba(239,68,68,0.25)',    text: '#fca5a5' },
  needs_regeneration: { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.20)', text: '#fcd34d' },
};

const STATUS_LABELS: Record<string, string> = {
  not_generated: 'Not Generated',
  generating: 'Generating…',
  ready_for_review: 'Ready for Review',
  approved: 'Approved',
  failed: 'Failed',
  needs_regeneration: 'Needs Regeneration',
};

// ── Canvas motion animation preview ──────────────────────────────────────────

function drawMotionFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number, H: number,
  progress: number,
  motionEffect: string,
  captionText: string | null,
) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const ease = progress < 0.5
    ? 2 * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 2) / 2;

  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  let dx = 0, dy = 0, dw = W, dh = H;

  switch (motionEffect) {
    case 'Slow Zoom In': { const s = 1 + ease * 0.15; dw = W*s; dh = H*s; dx = (W-dw)/2; dy = (H-dh)/2; break; }
    case 'Slow Zoom Out': { const s = 1.15 - ease*0.15; dw = W*s; dh = H*s; dx = (W-dw)/2; dy = (H-dh)/2; break; }
    case 'Pan Left':   dx = -ease*W*0.09; dw = W+Math.abs(dx); break;
    case 'Pan Right':  dx =  ease*W*0.09; dw = W+Math.abs(dx); break;
    case 'Tilt Up':    dy = -ease*H*0.09; dh = H+Math.abs(dy); break;
    case 'Tilt Down':  dy =  ease*H*0.09; dh = H+Math.abs(dy); break;
    case 'Parallax Drift': dx = Math.sin(progress*Math.PI*2)*W*0.03; dy = Math.cos(progress*Math.PI*2)*H*0.02; break;
    case 'Subtle Shake': { const k = Math.sin(progress*Math.PI*14)*5; dx = k; dy = k*0.6; break; }
    case 'Beat Pulse': { const p = 1+Math.abs(Math.sin(progress*Math.PI*4))*0.05; dw = W*p; dh = H*p; dx = (W-dw)/2; dy = (H-dh)/2; break; }
    case 'Flash Impact': if (progress < 0.12) { ctx.fillStyle = `rgba(255,255,255,${(0.12-progress)*8})`; ctx.fillRect(0,0,W,H); } break;
    case 'Glitch Flicker': if (Math.random() > 0.88) { sx = Math.random()*img.naturalWidth*0.08; sy = Math.random()*img.naturalHeight*0.08; sw = img.naturalWidth*0.92; sh = img.naturalHeight*0.92; } break;
    default: break;
  }

  const fadeIn  = Math.min(progress*7, 1);
  const fadeOut = Math.min((1-progress)*7, 1);
  ctx.globalAlpha = Math.min(fadeIn, fadeOut);
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.globalAlpha = 1;

  if (motionEffect === 'Flash Impact' && progress < 0.18) {
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 0.75-progress*5)})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (captionText) {
    const capProg = Math.min((progress-0.12)*5, 1);
    if (capProg > 0) {
      ctx.globalAlpha = capProg;
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(0, H-52, W, 52);
      ctx.font = `bold ${Math.round(W*0.044)}px system-ui,sans-serif`;
      ctx.fillStyle = '#f0f0ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const t = captionText.length > 54 ? captionText.slice(0,51)+'…' : captionText;
      ctx.fillText(t, W/2, H-26);
      ctx.globalAlpha = 1;
    }
  }
}

function MotionPreviewCanvas({
  imageUrl, motionEffect, captionText, duration = 4,
}: { imageUrl: string; motionEffect: string; captionText: string | null; duration?: number; }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number | null>(null);
  const startRef  = useRef<number | null>(null);
  const imgRef    = useRef<HTMLImageElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const draw = useCallback((p: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawMotionFrame(ctx, imgRef.current, canvas.width, canvas.height, p, motionEffect, captionText);
  }, [motionEffect, captionText]);

  const animate = useCallback((ts: number) => {
    if (!startRef.current) startRef.current = ts;
    const prog = Math.min((ts - startRef.current) / 1000 / duration, 1);
    draw(prog);
    if (prog < 1) animRef.current = requestAnimationFrame(animate);
    else setPlaying(false);
  }, [draw, duration]);

  const startPlay = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    startRef.current = null;
    setPlaying(true);
    animRef.current = requestAnimationFrame(animate);
  }, [animate]);

  const stopPlay = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => { imgRef.current = img; draw(0); };
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [imageUrl, draw]);

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid rgba(139,92,246,0.25)', background: '#000', aspectRatio: '16/9' }}>
        <canvas ref={canvasRef} width={480} height={270} className="w-full h-full" />
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.6)', color: '#a78bfa' }}>{motionEffect}</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.5)' }}>{duration}s · Canvas Preview</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={playing ? stopPlay : startPlay}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.30)', color: '#c4b5fd' }}
        >
          {playing ? <><Pause className="w-3 h-3" />Pause Preview</> : <><Play className="w-3 h-3" />Play Preview</>}
        </button>
      </div>
    </div>
  );
}

// ── Blocker check helpers ─────────────────────────────────────────────────────

interface Blocker { label: string; detail: string }

function getPreviewBlockers(
  plans: SceneMotionPlan[],
  clips: MotionClip[],
  sceneImages: SceneImage[],
  motionSettings: MotionSettings | null,
  audioUrl: string | null,
): Blocker[] {
  const blockers: Blocker[] = [];
  if (!motionSettings?.approved) {
    blockers.push({ label: 'Motion settings not saved', detail: 'Save Motion Style Settings to continue.' });
  }
  const included = plans.filter((p) => p.include_in_final_video !== false);
  for (const plan of included) {
    if (!plan.approved) {
      blockers.push({
        label: `Scene ${plan.scene_number} motion plan not approved`,
        detail: plan.scene_title ? `"${plan.scene_title}" — approve the motion plan first.` : `Approve Scene ${plan.scene_number}'s motion plan.`,
      });
    }
    const clip = clips.find((c) => c.scene_motion_plan_id === plan.id || c.scene_number === plan.scene_number);
    if (!clip) {
      blockers.push({
        label: `Scene ${plan.scene_number} has no motion clip`,
        detail: `Generate a motion clip for Scene ${plan.scene_number}.`,
      });
    }
    const img = sceneImages.find((i) => (i.storyboard_scene_id === plan.storyboard_scene_id || i.scene_number === plan.scene_number) && i.approved);
    if (!img) {
      blockers.push({
        label: `Scene ${plan.scene_number} has no approved image`,
        detail: `Approve a scene image for Scene ${plan.scene_number}.`,
      });
    }
  }
  return blockers;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function MotionClipSection({
  project, plans, sceneImages, motionSettings, clips, onClipsUpdate, onProjectUpdate,
}: Props) {
  const [generating, setGenerating]         = useState<Record<string, boolean>>({});
  const [approving,  setApproving]           = useState<Record<string, boolean>>({});
  const [bulkGenerating, setBulkGenerating]  = useState(false);
  const [bulkApproving,  setBulkApproving]   = useState(false);
  const [expanded, setExpanded]              = useState<Record<string, boolean>>({});
  const [showBlockers, setShowBlockers]      = useState(false);
  const [clipErrors, setClipErrors]          = useState<Record<string, string>>({});

  const getClip = (plan: SceneMotionPlan) =>
    clips.find((c) => c.scene_motion_plan_id === plan.id || c.scene_number === plan.scene_number);

  const getImage = (plan: SceneMotionPlan) =>
    sceneImages.find(
      (i) => (i.storyboard_scene_id === plan.storyboard_scene_id || i.scene_number === plan.scene_number) && i.approved
    );

  const clearClipError = (planId: string) =>
    setClipErrors((prev) => { const n = { ...prev }; delete n[planId]; return n; });

  // Build fallback clip insert payload — every column matches the DB schema
  const buildFallbackClipData = (plan: SceneMotionPlan, img: SceneImage | undefined) => ({
    project_id: project.id,
    scene_motion_plan_id: plan.id,
    storyboard_scene_id: plan.storyboard_scene_id ?? null,
    scene_image_id: img?.id ?? plan.scene_image_id ?? null,
    scene_number: plan.scene_number,
    scene_title: plan.scene_title ?? null,
    clip_url: null,
    preview_url: img?.image_url ?? null,
    duration: plan.duration ?? 4,
    motion_effect: plan.motion_effect ?? 'Slow Zoom In',
    transition_in: plan.transition_in ?? 'Fade',
    transition_out: plan.transition_out ?? 'Fade',
    caption_text: plan.caption_text ?? null,
    generation_status: 'ready_for_review' as const,
    status: 'ready_for_review' as const,
    approved: false,
    rejected: false,
    fallback_generated: true,
    pending: false,
    failed: false,
    needs_review: false,
    updated_after_approval: false,
    error_message: null,
    last_approved_at: null,
  });

  // Generate one clip — always succeeds via fallback; surfaces exact DB error
  const generateClip = async (plan: SceneMotionPlan, regenerate = false): Promise<MotionClip | null> => {
    if (!project.id) {
      const msg = 'Motion clip could not save because project_id was missing.';
      setClipErrors((p) => ({ ...p, [plan.id]: msg }));
      toast.error(`Scene ${plan.scene_number}: ${msg}`);
      return null;
    }
    if (!plan.storyboard_scene_id) {
      // Allow — storyboard_scene_id is nullable; just log it
      console.warn(`Scene ${plan.scene_number}: storyboard_scene_id is null — creating clip without it.`);
    }

    setGenerating((p) => ({ ...p, [plan.id]: true }));
    clearClipError(plan.id);
    try {
      const img = getImage(plan);
      const existing = getClip(plan);
      const clipData = buildFallbackClipData(plan, img);

      let result: MotionClip;
      if (existing && !regenerate) {
        const updatePayload = { ...clipData, updated_at: new Date().toISOString() };
        const { data, error } = await supabase
          .from('motion_clips')
          .update(updatePayload)
          .eq('id', existing.id)
          .select()
          .maybeSingle();
        if (error) throw new Error(`DB update error for Scene ${plan.scene_number}: ${error.message} (code: ${error.code})`);
        if (!data) throw new Error(`Motion clip update returned no data for Scene ${plan.scene_number}. Row may have been deleted.`);
        result = data as MotionClip;
      } else {
        if (existing) {
          await supabase.from('motion_clips').delete().eq('id', existing.id);
        }
        const { data, error } = await supabase
          .from('motion_clips')
          .insert(clipData)
          .select()
          .maybeSingle();
        if (error) throw new Error(`DB insert error for Scene ${plan.scene_number}: ${error.message} (code: ${error.code})`);
        if (!data) throw new Error(`Motion clip insert returned no data for Scene ${plan.scene_number}.`);
        result = data as MotionClip;
      }

      onClipsUpdate([...clips.filter((c) => c.id !== existing?.id), result]);
      toast.success(`Scene ${plan.scene_number} motion clip ready. (Fallback canvas mode)`);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Unknown error generating clip for Scene ${plan.scene_number}.`;
      console.error('generateClip error', err);
      setClipErrors((p) => ({ ...p, [plan.id]: msg }));
      toast.error(`Scene ${plan.scene_number}: ${msg}`);
      return null;
    } finally {
      setGenerating((p) => ({ ...p, [plan.id]: false }));
    }
  };

  // Approve one clip and update linked SceneMotionPlan
  const approveClip = async (clip: MotionClip) => {
    setApproving((p) => ({ ...p, [clip.id]: true }));
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('motion_clips')
        .update({
          approved: true,
          rejected: false,
          generation_status: 'approved',
          status: 'approved',
          pending: false,
          failed: false,
          needs_review: false,
          updated_after_approval: false,
          last_approved_at: now,
          updated_at: now,
        })
        .eq('id', clip.id)
        .select()
        .maybeSingle();
      if (error) throw new Error(`DB error approving Scene ${clip.scene_number} clip: ${error.message}`);
      const updated = (data as MotionClip) ?? { ...clip, approved: true, generation_status: 'approved' as const, status: 'approved' as const };

      // Also mark linked SceneMotionPlan as approved
      if (clip.scene_motion_plan_id) {
        await supabase
          .from('scene_motion_plans')
          .update({ approved: true, pending: false, rejected: false, last_approved_at: now, updated_at: now })
          .eq('id', clip.scene_motion_plan_id);
      }

      onClipsUpdate(clips.map((c) => (c.id === clip.id ? updated : c)));
      toast.success(`Scene ${clip.scene_number} motion clip approved.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown approval error.';
      console.error('approveClip error', err);
      toast.error(msg);
    } finally {
      setApproving((p) => ({ ...p, [clip.id]: false }));
    }
  };

  // Bulk generate all included plans
  const handleBulkGenerate = async () => {
    setBulkGenerating(true);
    const included = plans.filter(Boolean).filter((p) => p.include_in_final_video !== false);
    if (included.length === 0) {
      toast.error('No included scenes found. Save Motion Settings first.');
      setBulkGenerating(false);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const plan of included) {
      const result = await generateClip(plan, false);
      if (result) successCount++;
      else failCount++;
    }

    if (failCount === 0) {
      await supabase.from('projects').update({ status: 'Motion Clips In Review' }).eq('id', project.id);
      onProjectUpdate({ status: 'Motion Clips In Review' });
      toast.success(`All ${successCount} motion clips created using fallback canvas motion.`);
    } else if (successCount > 0) {
      await supabase.from('projects').update({ status: 'Motion Clips In Review' }).eq('id', project.id);
      onProjectUpdate({ status: 'Motion Clips In Review' });
      toast.warning(`${successCount} clips ready. ${failCount} failed — see error detail per scene.`);
    } else {
      toast.error(`All ${failCount} clips failed. See per-scene error detail below.`);
    }
    setBulkGenerating(false);
  };

  // Bulk approve all ready/completed clips
  const handleBulkApprove = async () => {
    setBulkApproving(true);
    const now = new Date().toISOString();
    const toApprove = clips.filter((c) =>
      (c.generation_status === 'ready_for_review' || c.generation_status === 'approved') && !c.approved
    );
    if (toApprove.length === 0) {
      toast.success('All motion clips already approved.');
      setBulkApproving(false);
      return;
    }

    let approved = 0;
    const updated: MotionClip[] = [...clips];
    for (const clip of toApprove) {
      try {
        const { data, error } = await supabase
          .from('motion_clips')
          .update({
            approved: true,
            rejected: false,
            generation_status: 'approved',
            status: 'approved',
            pending: false,
            failed: false,
            needs_review: false,
            updated_after_approval: false,
            last_approved_at: now,
            updated_at: now,
          })
          .eq('id', clip.id)
          .select()
          .maybeSingle();
        if (error) throw new Error(error.message);
        const idx = updated.findIndex((c) => c.id === clip.id);
        if (idx >= 0) updated[idx] = (data as MotionClip) ?? { ...clip, approved: true, generation_status: 'approved' as const, status: 'approved' as const };
        if (clip.scene_motion_plan_id) {
          await supabase
            .from('scene_motion_plans')
            .update({ approved: true, pending: false, rejected: false, last_approved_at: now, updated_at: now })
            .eq('id', clip.scene_motion_plan_id);
        }
        approved++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`approveClip bulk error Scene ${clip.scene_number}:`, msg);
      }
    }

    onClipsUpdate(updated);
    await supabase.from('projects').update({ status: 'Motion Clips Approved' }).eq('id', project.id);
    onProjectUpdate({ status: 'Motion Clips Approved' });
    if (approved === toApprove.length) {
      toast.success(`${approved} motion clip${approved > 1 ? 's' : ''} approved!`);
    } else {
      toast.warning(`${approved}/${toApprove.length} clips approved. Some failed — check console for details.`);
    }
    setBulkApproving(false);
  };

  const included        = plans.filter(Boolean).filter((p) => p.include_in_final_video !== false);
  const readyCount      = clips.filter((c) => c.generation_status === 'ready_for_review' || c.approved).length;
  const approvedCount   = clips.filter((c) => c.approved).length;
  const previewBlockers = getPreviewBlockers(included, clips, sceneImages, motionSettings, project.song_file);
  const allClipsReady   = included.length > 0 &&
    included.every((p) => {
      const c = clips.find((cl) => cl.scene_motion_plan_id === p.id || cl.scene_number === p.scene_number);
      return c && (c.generation_status === 'ready_for_review' || c.approved);
    });

  return (
    <div className="space-y-5">
      {/* Summary + bulk controls */}
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground/90">
            Motion Clips
            <span className="ml-2 text-xs font-mono text-muted-foreground/50">
              {approvedCount}/{included.length} approved · {readyCount}/{included.length} ready
            </span>
          </p>
          {included.length === 0 && (
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              Save Motion Settings first to generate the motion timeline.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={handleBulkGenerate}
            disabled={bulkGenerating || included.length === 0}
            className="h-9 text-xs font-semibold"
            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)', color: '#93c5fd' }}
          >
            {bulkGenerating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Film className="w-3.5 h-3.5 mr-1.5" />}
            Generate All Motion Clips
          </Button>
          <Button
            size="sm"
            onClick={handleBulkApprove}
            disabled={bulkApproving || readyCount === 0}
            className="h-9 text-xs font-semibold"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.30)', color: '#6ee7b7' }}
          >
            {bulkApproving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
            Approve All Motion Clips
          </Button>
        </div>
      </div>

      {/* All ready banner */}
      {allClipsReady && (
        <div
          className="rounded-2xl px-5 py-3 flex items-center gap-3"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.22)' }}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300">
            All {included.length} motion clips are ready.{' '}
            {approvedCount < included.length ? 'Approve them below or use Approve All to unlock preview.' : 'All clips approved — preview and render are unlocked.'}
          </p>
        </div>
      )}

      {/* Per-scene cards */}
      {included.map((plan) => {
        const clip       = getClip(plan);
        const img        = getImage(plan);
        const status     = clip?.generation_status ?? 'not_generated';
        const colorSet   = clipErrors[plan.id]
          ? { bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.28)', text: '#fca5a5' }
          : (STATUS_COLORS[status] ?? STATUS_COLORS.not_generated);
        const isGenerating = generating[plan.id];
        const isApproving  = approving[clip?.id ?? ''];
        const isExpanded   = expanded[plan.id];
        const planError    = clipErrors[plan.id];

        return (
          <div
            key={plan.id}
            className="rounded-2xl overflow-hidden"
            style={{ background: colorSet.bg, border: `1px solid ${colorSet.border}` }}
          >
            {/* Header row */}
            <div className="flex items-center gap-3 p-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-mono text-xs font-bold"
                style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}
              >
                {String(plan.scene_number).padStart(2, '0')}
              </div>

              {img?.image_url && (
                <div className="w-12 h-8 rounded-md overflow-hidden shrink-0" style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                  <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground/90 truncate">
                  {plan.scene_title ?? `Scene ${plan.scene_number}`}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                    style={{ background: colorSet.bg, color: colorSet.text, border: `1px solid ${colorSet.border}` }}
                  >
                    {STATUS_LABELS[status] ?? status}
                  </span>
                  {clip?.fallback_generated && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.25)' }}>
                      Canvas Fallback
                    </span>
                  )}
                  {planError && <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Generate / Regenerate */}
                <button
                  onClick={() => generateClip(plan, !!clip)}
                  disabled={isGenerating}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
                  style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.30)', color: '#93c5fd' }}
                  title={clip ? 'Regenerate Motion Clip' : 'Generate Motion Clip'}
                >
                  {isGenerating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : clip ? (
                    <RefreshCw className="w-3 h-3" />
                  ) : (
                    <Zap className="w-3 h-3" />
                  )}
                  {clip ? 'Regen' : 'Generate'}
                </button>

                {/* Approve */}
                {clip && !clip.approved && (clip.generation_status === 'ready_for_review' || clip.generation_status === 'approved') && (
                  <button
                    onClick={() => approveClip(clip)}
                    disabled={isApproving}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold"
                    style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.30)', color: '#6ee7b7' }}
                  >
                    {isApproving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Approve
                  </button>
                )}
                {clip?.approved && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}

                {/* Expand canvas preview */}
                {(img?.image_url || clip) && (
                  <button
                    onClick={() => setExpanded((p) => ({ ...p, [plan.id]: !p[plan.id] }))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Settings2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>

            {/* Error debug panel — shown when generate/approve fails */}
            {planError && (
              <div
                className="mx-4 mb-3 rounded-xl p-3 text-xs space-y-2"
                style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)' }}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-red-300 mb-0.5">
                      Why did motion generation fail? — Scene {plan.scene_number}
                    </p>
                    <p className="text-red-200/80 break-words">{planError}</p>
                    <p className="text-muted-foreground/50 mt-1">
                      Scene: {plan.scene_title ?? `Scene ${plan.scene_number}`} ·{' '}
                      Motion: {plan.motion_effect} ·{' '}
                      Image: {img ? 'Found' : 'Missing (using placeholder)'}
                    </p>
                  </div>
                  <button
                    onClick={() => clearClipError(plan.id)}
                    className="shrink-0 text-red-400/60 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => generateClip(plan, true)}
                    disabled={isGenerating}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold"
                    style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)', color: '#93c5fd' }}
                  >
                    {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Retry with Fallback
                  </button>
                </div>
              </div>
            )}

            {/* Canvas preview expand */}
            {isExpanded && (
              <div className="px-4 pb-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="pt-3">
                  {img?.image_url ? (
                    <MotionPreviewCanvas
                      imageUrl={img.image_url}
                      motionEffect={plan.motion_effect}
                      captionText={plan.caption_text}
                      duration={plan.duration ?? 4}
                    />
                  ) : (
                    <div className="rounded-xl flex items-center justify-center text-muted-foreground/40 text-xs" style={{ aspectRatio: '16/9', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      No scene image — motion effect: {plan.motion_effect}
                    </div>
                  )}
                  {clip?.caption_text && (
                    <p className="mt-2 text-xs text-muted-foreground/60 italic">
                      Caption: &ldquo;{clip.caption_text}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Why Can't I Preview or Render? panel */}
      {included.length > 0 && (
        <div>
          <button
            onClick={() => setShowBlockers((v) => !v)}
            className="flex items-center gap-2 text-xs text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Why Can't I Preview or Render?
            {showBlockers ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showBlockers && (
            <div
              className="mt-3 rounded-2xl p-4 space-y-2"
              style={{ background: previewBlockers.length === 0 ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)', border: previewBlockers.length === 0 ? '1px solid rgba(16,185,129,0.20)' : '1px solid rgba(245,158,11,0.22)' }}
            >
              <p className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: previewBlockers.length === 0 ? '#6ee7b7' : '#fcd34d' }}>
                {previewBlockers.length === 0 ? '✓ No blockers — preview and render are unlocked' : `${previewBlockers.length} blocker${previewBlockers.length > 1 ? 's' : ''} found`}
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
        </div>
      )}
    </div>
  );
}
