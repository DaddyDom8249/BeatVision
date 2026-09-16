import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Play, RefreshCw, AlertTriangle, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Project, SceneMotionPlan, SceneImage, MotionClip } from '@/types/types';
import { supabase } from '@/db/supabase';
import { createWorkerMotionJob, getWorkerMotionJob, isBeatVisionWorkerConfigured } from '@/services/beatvision-worker';
import { toast } from 'sonner';

interface Props { project: Project; plans: SceneMotionPlan[]; sceneImages: SceneImage[]; clips: MotionClip[]; onClipsUpdate: (clips: MotionClip[]) => void; onProjectUpdate: (p: Partial<Project>) => void; }
const POLL_MS = 7000; const MAX_POLL_MS = 10 * 60 * 1000;
type WorkerOutput = { video_url?: string; asset_id?: string };
const promptFor = (p: SceneMotionPlan, i: SceneImage) => ['BeatVision cinematic music-video motion shot.', `Scene ${p.scene_number}: ${p.scene_title || 'Untitled scene'}.`, p.motion_effect ? `Motion direction: ${p.motion_effect}.` : '', p.lyric_moment ? `Lyric moment: ${p.lyric_moment}.` : '', i.prompt_summary || i.prompt_used || '', i.camera_framing ? `Camera: ${i.camera_framing}.` : '', i.mood ? `Mood: ${i.mood}.` : '', i.lighting_direction ? `Lighting: ${i.lighting_direction}.` : '', 'Preserve the approved character, environment, composition and visual identity. No text, logos, captions or unrelated visual changes.'].filter(Boolean).join('\n');

export default function CloudflareMotionClipSection({ project, plans, sceneImages, clips, onClipsUpdate, onProjectUpdate }: Props) {
  const [busy, setBusy] = useState<Record<string, boolean>>({}); const [errors, setErrors] = useState<Record<string, string>>({}); const polling = useRef(new Map<string, number>()); const configured = isBeatVisionWorkerConfigured();
  const imageFor = useCallback((p: SceneMotionPlan) => sceneImages.find(i => (i.storyboard_scene_id === p.storyboard_scene_id || i.scene_number === p.scene_number) && i.approved && Boolean(i.image_url)), [sceneImages]);
  const clipFor = useCallback((p: SceneMotionPlan) => clips.find(c => c.scene_motion_plan_id === p.id || c.scene_number === p.scene_number), [clips]);
  const refresh = useCallback(async () => { const { data } = await supabase.from('motion_clips').select('*').eq('project_id', project.id).order('scene_number', { ascending: true }); if (Array.isArray(data)) onClipsUpdate(data as MotionClip[]); }, [project.id, onClipsUpdate]);
  useEffect(() => () => polling.current.clear(), []);

  const poll = useCallback(async (plan: SceneMotionPlan, clipId: string, jobId: string, started: number) => {
    if (Date.now() - started > MAX_POLL_MS) { polling.current.delete(plan.id); const message = 'Cloudflare Worker motion job timed out.'; await supabase.from('motion_clips').update({ generation_status: 'failed', status: 'failed', pending: false, failed: true, error_message: message, updated_at: new Date().toISOString() }).eq('id', clipId); setErrors(x => ({ ...x, [plan.id]: message })); setBusy(x => ({ ...x, [plan.id]: false })); await refresh(); return; }
    try {
      const job = await getWorkerMotionJob(jobId); const output = (job.output || {}) as WorkerOutput;
      if (job.status === 'succeeded' && output.video_url) { polling.current.delete(plan.id); await supabase.from('motion_clips').update({ clip_url: output.video_url, preview_url: output.video_url, generation_status: 'ready_for_review', status: 'ready_for_review', pending: false, failed: false, error_message: null, updated_at: new Date().toISOString() }).eq('id', clipId); setBusy(x => ({ ...x, [plan.id]: false })); toast.success(`Scene ${plan.scene_number} motion is ready for review.`); await refresh(); return; }
      if (job.status === 'failed' || job.status === 'cancelled') { polling.current.delete(plan.id); const message = job.error || `Worker job ${job.status}.`; await supabase.from('motion_clips').update({ generation_status: 'failed', status: 'failed', pending: false, failed: true, error_message: message, updated_at: new Date().toISOString() }).eq('id', clipId); setErrors(x => ({ ...x, [plan.id]: message })); setBusy(x => ({ ...x, [plan.id]: false })); await refresh(); return; }
      window.setTimeout(() => void poll(plan, clipId, jobId, started), POLL_MS);
    } catch (error) { setErrors(x => ({ ...x, [plan.id]: error instanceof Error ? error.message : String(error) })); window.setTimeout(() => void poll(plan, clipId, jobId, started), POLL_MS); }
  }, [refresh]);

  const generate = async (plan: SceneMotionPlan) => {
    if (busy[plan.id]) return; if (!configured) { const m = 'Cloudflare Worker is not configured. Set VITE_BEATVISION_WORKER_URL.'; setErrors(x => ({ ...x, [plan.id]: m })); toast.error(m); return; }
    const image = imageFor(plan); if (!image?.image_url) { const m = `Scene ${plan.scene_number} needs an approved image.`; setErrors(x => ({ ...x, [plan.id]: m })); toast.error(m); return; }
    setBusy(x => ({ ...x, [plan.id]: true })); setErrors(x => { const n = { ...x }; delete n[plan.id]; return n; });
    try {
      const existing = clipFor(plan); const jobId = existing?.id || crypto.randomUUID();
      const job = await createWorkerMotionJob({ projectId: project.id, jobId, idempotencyKey: `${project.id}:motion:${plan.id}`, scene: { scene: plan.scene_number, scene_number: plan.scene_number, scene_title: plan.scene_title, duration_seconds: plan.duration ?? 4, motion_effect: plan.motion_effect, transition_in: plan.transition_in, transition_out: plan.transition_out }, imageUrl: image.image_url, prompt: promptFor(plan, image), durationSeconds: plan.duration ?? 4 });
      const payload = { project_id: project.id, scene_motion_plan_id: plan.id, storyboard_scene_id: plan.storyboard_scene_id ?? null, scene_image_id: image.id, scene_number: plan.scene_number, scene_title: plan.scene_title ?? null, clip_url: null, preview_url: image.image_url, duration: plan.duration ?? 4, motion_effect: plan.motion_effect ?? 'Cloudflare Worker / Pixazo LTX', transition_in: plan.transition_in ?? 'Fade', transition_out: plan.transition_out ?? 'Fade', caption_text: plan.caption_text ?? null, generation_status: 'generating' as const, status: 'generating' as const, approved: false, rejected: false, fallback_generated: false, pending: true, failed: false, needs_review: false, updated_after_approval: false, error_message: null, last_approved_at: null, updated_at: new Date().toISOString() };
      const saved = existing ? (await supabase.from('motion_clips').update(payload).eq('id', existing.id).select().maybeSingle()).data : (await supabase.from('motion_clips').insert(payload).select().maybeSingle()).data;
      if (!saved) throw new Error('Failed to persist motion job state.');
      polling.current.set(plan.id, Date.now()); void poll(plan, saved.id, job.job_id, Date.now()); onProjectUpdate({ status: 'Generating Motion' });
    } catch (error) { const m = error instanceof Error ? error.message : String(error); setErrors(x => ({ ...x, [plan.id]: m })); setBusy(x => ({ ...x, [plan.id]: false })); toast.error(`Scene ${plan.scene_number}: ${m}`); }
  };

  const approve = async (plan: SceneMotionPlan) => { const clip = clipFor(plan); if (!clip?.clip_url) return; await supabase.from('motion_clips').update({ approved: true, rejected: false, needs_review: false, updated_after_approval: false, generation_status: 'approved', status: 'approved', last_approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', clip.id); await refresh(); toast.success(`Scene ${plan.scene_number} motion approved.`); };
  const included = useMemo(() => plans.filter(p => p.include_in_final_video !== false), [plans]);
  const generateAll = async () => { for (const p of included.filter(x => x.approved)) await generate(p); onProjectUpdate({ status: 'Motion In Review' }); };
  const ready = included.filter(p => Boolean(clipFor(p)?.clip_url)).length; const approved = included.filter(p => clipFor(p)?.approved).length;

  return <div className="space-y-4">
    <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-center gap-3"><Film className="w-5 h-5 text-primary" /><div className="flex-1"><p className="font-semibold">Cloudflare Worker Motion Pipeline</p><p className="text-xs text-muted-foreground">{ready}/{included.length} ready · {approved}/{included.length} approved · no simulated success</p></div><Button onClick={() => void generateAll()} disabled={!configured || !included.length}><Play className="w-4 h-4 mr-2" /> Generate Approved Scenes</Button></div>
    {!configured && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-300"><AlertTriangle className="w-4 h-4 inline mr-2" />Set VITE_BEATVISION_WORKER_URL to enable the Worker.</div>}
    {included.map(plan => { const clip = clipFor(plan); const image = imageFor(plan); const isBusy = Boolean(busy[plan.id]); return <div key={plan.id} className="rounded-xl border border-border bg-card p-4 space-y-3"><div className="flex items-center gap-3"><span className="text-xs font-mono text-muted-foreground">SCENE {plan.scene_number}</span><span className="font-medium flex-1">{plan.scene_title || `Scene ${plan.scene_number}`}</span><Badge variant="outline">{clip?.status || 'NOT GENERATED'}</Badge></div>{clip?.clip_url ? <video src={clip.clip_url} controls className="w-full rounded-lg aspect-video bg-black" /> : image?.image_url ? <img src={image.image_url} alt="" className="w-full rounded-lg aspect-video object-cover" /> : null}{errors[plan.id] && <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">{errors[plan.id]}</div>}<div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void generate(plan)} disabled={isBusy || !plan.approved || !image?.image_url}>{isBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}{clip?.clip_url ? 'Regenerate Motion' : 'Generate Motion'}</Button>{clip?.clip_url && !clip.approved && <Button size="sm" onClick={() => void approve(plan)}><CheckCircle2 className="w-4 h-4 mr-2" />Approve</Button>}</div></div>; })}
  </div>;
}
