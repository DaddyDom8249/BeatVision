import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/db/supabase';
import type { Project, SceneImage, SceneVideo, VideoGenerationStatus } from '@/types/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Play, RefreshCw, CheckCircle2, XCircle, Film,
  Loader2, ChevronDown, ChevronUp, AlertTriangle, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  project: Project;
  onProjectUpdate: (updated: Partial<Project>) => void;
}

// Polling interval and timeout per task
const POLL_INTERVAL_MS = 7_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildVideoPrompt(img: SceneImage): string {
  const parts: string[] = [];
  if (img.prompt_summary) parts.push(img.prompt_summary);
  else if (img.prompt_used) parts.push(img.prompt_used.slice(0, 300));
  if (img.camera_framing) parts.push(`Camera: ${img.camera_framing}`);
  if (img.mood) parts.push(`Mood: ${img.mood}`);
  if (img.lighting_direction) parts.push(`Lighting: ${img.lighting_direction}`);
  parts.push('Cinematic motion, subtle camera movement, atmospheric.');
  return parts.join('. ');
}

function statusLabel(s: VideoGenerationStatus): string {
  switch (s) {
    case 'pending': return 'Pending';
    case 'submitted': return 'Submitted';
    case 'processing': return 'Generating…';
    case 'succeed': return 'Ready';
    case 'failed': return 'Failed';
  }
}

function statusColor(s: VideoGenerationStatus): string {
  switch (s) {
    case 'pending': return 'bg-muted text-muted-foreground border-border';
    case 'submitted': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    case 'processing': return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
    case 'succeed': return 'bg-green-500/15 text-green-400 border-green-500/30';
    case 'failed': return 'bg-destructive/10 text-destructive border-destructive/30';
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GenerateMotionSection({ project, onProjectUpdate }: Props) {
  const [sceneImages, setSceneImages] = useState<SceneImage[]>([]);
  const [sceneVideos, setSceneVideos] = useState<SceneVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pollingRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const [imagesRes, videosRes] = await Promise.all([
      supabase
        .from('scene_images')
        .select('*')
        .eq('project_id', project.id)
        .eq('approved', true)
        .order('scene_number', { ascending: true }),
      supabase
        .from('scene_videos')
        .select('*')
        .eq('project_id', project.id)
        .order('scene_number', { ascending: true }),
    ]);

    if (imagesRes.data) setSceneImages(Array.isArray(imagesRes.data) ? imagesRes.data : []);
    if (videosRes.data) setSceneVideos(Array.isArray(videosRes.data) ? videosRes.data : []);
    setLoading(false);
  }, [project.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Polling ────────────────────────────────────────────────────────────────

  const stopPolling = useCallback((videoId: string) => {
    const interval = pollingRefs.current.get(videoId);
    if (interval) {
      clearInterval(interval);
      pollingRefs.current.delete(videoId);
    }
  }, []);

  const pollTask = useCallback(async (videoId: string, taskId: string) => {
    const { data, error } = await supabase.functions.invoke('kling-omni-video-query', {
      body: { task_id: taskId },
    });

    if (error) {
      const msg = await error?.context?.text?.();
      console.error('kling-omni-video-query error:', msg || error.message);
      return;
    }

    const taskData = data?.data;
    if (!taskData) return;

    const status: VideoGenerationStatus =
      taskData.task_status === 'succeed' ? 'succeed'
      : taskData.task_status === 'failed' ? 'failed'
      : taskData.task_status === 'processing' ? 'processing'
      : 'submitted';

    const videoUrl = taskData.task_result?.videos?.[0]?.url ?? null;
    const duration = taskData.task_result?.videos?.[0]?.duration ?? null;

    // Update DB
    await supabase
      .from('scene_videos')
      .update({
        generation_status: status,
        task_status_msg: taskData.task_status_msg ?? null,
        video_url: videoUrl,
        duration,
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId);

    // Update local state
    setSceneVideos(prev =>
      prev.map(v =>
        v.id === videoId ? { ...v, generation_status: status, video_url: videoUrl, duration } : v
      )
    );

    if (status === 'succeed') {
      stopPolling(videoId);
      setGeneratingIds(prev => { const s = new Set(prev); s.delete(videoId); return s; });
      toast.success('Scene video ready! Review and approve it.');
    } else if (status === 'failed') {
      stopPolling(videoId);
      setGeneratingIds(prev => { const s = new Set(prev); s.delete(videoId); return s; });
      toast.error(`Video generation failed: ${taskData.task_status_msg ?? 'Unknown error'}`);
    }
  }, [stopPolling]);

  const startPolling = useCallback((videoId: string, taskId: string) => {
    stopPolling(videoId);
    setGeneratingIds(prev => new Set([...prev, videoId]));

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    const interval = setInterval(async () => {
      if (Date.now() > deadline) {
        stopPolling(videoId);
        setGeneratingIds(prev => { const s = new Set(prev); s.delete(videoId); return s; });
        await supabase
          .from('scene_videos')
          .update({ generation_status: 'failed', task_status_msg: 'Timed out after 10 minutes', updated_at: new Date().toISOString() })
          .eq('id', videoId);
        setSceneVideos(prev =>
          prev.map(v => v.id === videoId ? { ...v, generation_status: 'failed' as const } : v)
        );
        toast.error('Video generation timed out. Please retry.');
        return;
      }
      await pollTask(videoId, taskId);
    }, POLL_INTERVAL_MS);

    pollingRefs.current.set(videoId, interval);
  }, [stopPolling, pollTask]);

  // Resume polling for any in-progress videos on mount
  useEffect(() => {
    sceneVideos.forEach(v => {
      if ((v.generation_status === 'submitted' || v.generation_status === 'processing') && v.task_id) {
        startPolling(v.id, v.task_id);
      }
    });
    return () => {
      pollingRefs.current.forEach(interval => clearInterval(interval));
      pollingRefs.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneVideos.length]);

  // ── Generate one scene video ───────────────────────────────────────────────

  const generateOne = async (img: SceneImage): Promise<void> => {
    const prompt = buildVideoPrompt(img);

    // Upsert a scene_videos record (create or reset existing)
    const existing = sceneVideos.find(v => v.scene_image_id === img.id);
    let videoId: string;

    if (existing) {
      await supabase
        .from('scene_videos')
        .update({
          generation_status: 'submitted',
          task_id: null,
          video_url: null,
          approved: false,
          rejected: false,
          needs_review: false,
          prompt_used: prompt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      videoId = existing.id;
      setSceneVideos(prev =>
        prev.map(v =>
          v.id === existing.id
            ? { ...v, generation_status: 'submitted' as const, video_url: null, task_id: null, approved: false }
            : v
        )
      );
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('scene_videos')
        .insert({
          project_id: project.id,
          scene_image_id: img.id,
          scene_number: img.scene_number,
          scene_title: img.scene_title,
          generation_status: 'submitted',
          prompt_used: prompt,
        })
        .select()
        .maybeSingle();
      if (insertErr || !inserted) {
        toast.error('Failed to create video record.');
        return;
      }
      videoId = inserted.id;
      setSceneVideos(prev => [...prev, inserted as SceneVideo]);
    }

    // Submit task to Kling via edge function
    const { data: submitData, error: submitErr } = await supabase.functions.invoke('kling-omni-video-submit', {
      body: {
        prompt: `<<<image_1>>>. ${prompt}`,
        image_list: img.image_url ? [{ image_url: img.image_url }] : [],
        aspect_ratio: '16:9',
        duration: '5',
        mode: 'pro',
        sound: 'on',
        external_task_id: videoId,
      },
    });

    if (submitErr) {
      const msg = await submitErr?.context?.text?.();
      console.error('kling-omni-video-submit error:', msg || submitErr.message);
      await supabase
        .from('scene_videos')
        .update({ generation_status: 'failed', task_status_msg: msg || submitErr.message, updated_at: new Date().toISOString() })
        .eq('id', videoId);
      setSceneVideos(prev =>
        prev.map(v => v.id === videoId ? { ...v, generation_status: 'failed' as const } : v)
      );
      toast.error('Failed to submit video generation. Please try again.');
      return;
    }

    if (submitData?.code !== 0) {
      const errMsg = `API error ${submitData.code}: ${submitData.message}`;
      await supabase
        .from('scene_videos')
        .update({ generation_status: 'failed', task_status_msg: errMsg, updated_at: new Date().toISOString() })
        .eq('id', videoId);
      setSceneVideos(prev =>
        prev.map(v => v.id === videoId ? { ...v, generation_status: 'failed' as const } : v)
      );
      toast.error(errMsg);
      return;
    }

    const taskId: string = submitData.data.task_id;

    // Persist task_id and start polling
    await supabase
      .from('scene_videos')
      .update({ task_id: taskId, updated_at: new Date().toISOString() })
      .eq('id', videoId);
    setSceneVideos(prev =>
      prev.map(v => v.id === videoId ? { ...v, task_id: taskId } : v)
    );

    startPolling(videoId, taskId);
  };

  // ── Generate all scenes ────────────────────────────────────────────────────

  const handleGenerateAll = async () => {
    if (generatingAll) return;
    setGeneratingAll(true);

    // Update project status
    await supabase
      .from('projects')
      .update({ status: 'Generating Motion', updated_at: new Date().toISOString() })
      .eq('id', project.id);
    onProjectUpdate({ status: 'Generating Motion' });

    try {
      for (const img of sceneImages) {
        const existing = sceneVideos.find(v => v.scene_image_id === img.id);
        if (existing && (existing.generation_status === 'submitted' || existing.generation_status === 'processing')) continue;
        await generateOne(img);
        // Small stagger to avoid hammering the API
        await new Promise(r => setTimeout(r, 800));
      }
      toast.success('All scenes submitted for video generation. This takes a few minutes.');

      await supabase
        .from('projects')
        .update({ status: 'Motion In Review', updated_at: new Date().toISOString() })
        .eq('id', project.id);
      onProjectUpdate({ status: 'Motion In Review' });
    } finally {
      setGeneratingAll(false);
    }
  };

  // ── Approve / Reject ───────────────────────────────────────────────────────

  const handleApprove = async (videoId: string) => {
    const now = new Date().toISOString();
    await supabase
      .from('scene_videos')
      .update({
        approved: true,
        rejected: false,
        needs_review: false,
        updated_after_approval: false,
        last_approved_at: now,
        updated_at: now,
      })
      .eq('id', videoId);

    const updated = sceneVideos.map(v =>
      v.id === videoId ? { ...v, approved: true, rejected: false } : v
    );
    setSceneVideos(updated);
    toast.success('Scene video approved.');

    const approvedCount = updated.filter(v => v.approved).length;
    if (approvedCount >= sceneImages.length && sceneImages.length > 0) {
      await supabase
        .from('projects')
        .update({ status: 'Motion Approved', motion_approved: true, updated_at: now })
        .eq('id', project.id);
      onProjectUpdate({ status: 'Motion Approved', motion_approved: true });
      toast.success('All scene videos approved! Your project is Motion Complete.', { duration: 6000 });
    }
  };

  const handleReject = async (videoId: string) => {
    const now = new Date().toISOString();
    await supabase
      .from('scene_videos')
      .update({ rejected: true, approved: false, needs_review: false, updated_at: now })
      .eq('id', videoId);
    setSceneVideos(prev =>
      prev.map(v => v.id === videoId ? { ...v, rejected: true, approved: false } : v)
    );
    toast.info('Scene marked for regeneration.');
  };

  const handleRetry = async (img: SceneImage) => {
    await generateOne(img);
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  const totalScenes = sceneImages.length;
  const readyCount = sceneVideos.filter(v => v.generation_status === 'succeed').length;
  const approvedCount = sceneVideos.filter(v => v.approved).length;
  const failedCount = sceneVideos.filter(v => v.generation_status === 'failed').length;
  const inProgressCount = sceneVideos.filter(
    v => v.generation_status === 'submitted' || v.generation_status === 'processing'
  ).length;
  const progressPct = totalScenes > 0 ? Math.round((readyCount / totalScenes) * 100) : 0;
  const allApproved = totalScenes > 0 && approvedCount >= totalScenes;
  const anyGenerating = generatingAll || inProgressCount > 0;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading motion generation…
      </div>
    );
  }

  if (totalScenes === 0) {
    return (
      <Card className="bg-card/60 border-border">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No approved scene images found. Approve scene images first to generate motion.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Summary bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-xl border border-border bg-card/60">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <Film className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {approvedCount} / {totalScenes} approved
              {inProgressCount > 0 && (
                <span className="ml-2 text-xs text-yellow-400 font-normal">
                  · {inProgressCount} generating…
                </span>
              )}
              {failedCount > 0 && (
                <span className="ml-2 text-xs text-destructive font-normal">
                  · {failedCount} failed
                </span>
              )}
            </p>
            <Progress value={progressPct} className="mt-1.5 h-1.5 w-48 max-w-full" />
          </div>
        </div>

        {allApproved ? (
          <div className="flex items-center gap-1.5 text-emerald-400 text-sm font-semibold shrink-0">
            <CheckCircle2 className="w-4 h-4" />
            Motion Complete
          </div>
        ) : (
          <Button
            onClick={handleGenerateAll}
            disabled={anyGenerating}
            size="sm"
            className="shrink-0 font-mono text-xs"
          >
            {generatingAll ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Submitting…</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Generate All Scenes</>
            )}
          </Button>
        )}
      </div>

      {/* ── Per-scene cards ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        {sceneImages.map((img) => {
          const vid = sceneVideos.find(v => v.scene_image_id === img.id);
          const isGenerating = generatingIds.has(vid?.id ?? '');
          const isExpanded = expandedId === img.id;

          return (
            <Card
              key={img.id}
              className={`border transition-colors ${
                vid?.approved
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : vid?.generation_status === 'failed'
                  ? 'border-destructive/30 bg-destructive/5'
                  : 'border-border bg-card/60'
              }`}
            >
              <CardContent className="p-4">
                {/* ── Row: image thumb + meta + actions ─────────────────── */}
                <div className="flex items-start gap-3">
                  {/* Thumbnail */}
                  <div className="w-20 md:w-24 aspect-video rounded-lg overflow-hidden shrink-0 bg-muted border border-border">
                    {img.image_url ? (
                      <img
                        src={img.image_url}
                        alt={img.scene_title ?? `Scene ${img.scene_number}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <Film className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">
                        Scene {img.scene_number}
                      </span>
                      {vid && (
                        <Badge className={`text-[10px] border ${statusColor(vid.generation_status)}`}>
                          {isGenerating && vid.generation_status !== 'succeed'
                            ? <><Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />{statusLabel(vid.generation_status)}</>
                            : statusLabel(vid.generation_status)
                          }
                        </Badge>
                      )}
                      {vid?.approved && (
                        <Badge className="text-[10px] border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                          <CheckCircle2 className="w-2.5 h-2.5 mr-1" />Approved
                        </Badge>
                      )}
                      {vid?.rejected && (
                        <Badge className="text-[10px] border bg-destructive/10 text-destructive border-destructive/30">
                          <XCircle className="w-2.5 h-2.5 mr-1" />Rejected
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground mt-0.5 truncate">
                      {img.scene_title ?? `Scene ${img.scene_number}`}
                    </p>
                    {img.mood && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{img.mood}</p>
                    )}
                    {vid?.generation_status === 'failed' && vid.task_status_msg && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        {vid.task_status_msg}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    {/* Generate / Retry */}
                    {(!vid || vid.generation_status === 'failed' || vid.generation_status === 'pending') && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRetry(img)}
                        disabled={isGenerating}
                        className="text-xs h-8 px-3"
                      >
                        {isGenerating
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <><Play className="w-3 h-3 mr-1" />Generate</>
                        }
                      </Button>
                    )}

                    {/* Regenerate when succeed */}
                    {vid && vid.generation_status === 'succeed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRetry(img)}
                        disabled={isGenerating}
                        className="text-xs h-8 px-3"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />Redo
                      </Button>
                    )}

                    {/* Approve */}
                    {vid && vid.generation_status === 'succeed' && !vid.approved && (
                      <Button
                        size="sm"
                        onClick={() => handleApprove(vid.id)}
                        className="text-xs h-8 px-3"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />Approve
                      </Button>
                    )}

                    {/* Reject */}
                    {vid && vid.generation_status === 'succeed' && !vid.rejected && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReject(vid.id)}
                        className="text-xs h-8 px-3 text-muted-foreground hover:text-destructive"
                      >
                        <XCircle className="w-3 h-3 mr-1" />Reject
                      </Button>
                    )}

                    {/* Expand to view video */}
                    {vid?.video_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedId(isExpanded ? null : img.id)}
                        className="text-xs h-8 px-3 text-muted-foreground"
                      >
                        {isExpanded
                          ? <><ChevronUp className="w-3 h-3 mr-1" />Hide</>
                          : <><ChevronDown className="w-3 h-3 mr-1" />Preview</>
                        }
                      </Button>
                    )}
                  </div>
                </div>

                {/* ── Expanded video player ──────────────────────────────── */}
                {isExpanded && vid?.video_url && (
                  <div className="mt-4 rounded-xl overflow-hidden border border-border bg-black">
                    <video
                      src={vid.video_url}
                      controls
                      autoPlay
                      loop
                      playsInline
                      className="w-full max-h-[420px] object-contain"
                    />
                    {vid.duration && (
                      <p className="text-center text-xs text-muted-foreground py-1.5">
                        Duration: {vid.duration}s
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Motion Complete banner ───────────────────────────────────────── */}
      {allApproved && (
        <div
          className="rounded-xl p-5 text-center border"
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.03) 100%)',
            border: '1px solid rgba(16,185,129,0.25)',
          }}
        >
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <h3 className="font-mono text-base font-bold text-emerald-400">All Scene Videos Approved</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Your music video is Motion Complete — every scene has its world in motion.
          </p>
          <p className="font-mono text-sm text-emerald-400 font-bold mt-2">Ready for Export</p>
        </div>
      )}
    </div>
  );
}
