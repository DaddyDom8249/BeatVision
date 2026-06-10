import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Clapperboard,
  Layers,
  Play,
  CheckCircle2,
  AlertTriangle,
  Info,
  Loader2,
  Download,
  RefreshCw,
  Film,
  ChevronDown,
  ChevronUp,
  Clock,
  Music,
  Scissors,
  BarChart3,
  ShieldCheck,
  Eye,
  ImageIcon,
  Zap,
  FileJson,
  MonitorPlay,
  Wrench,
  Video,
} from 'lucide-react';
import type {
  Project,
  StoryboardScene,
  SceneImage,
  VideoSegment,
  VideoSegmentRenderStatus,
  SegmentationMode,
  RenderManifest,
  RenderManifestSegment,
  FinalVideo,
} from '@/types/types';
import { MOTION_EFFECTS } from '@/types/types';

const SEGMENTATION_MODES: SegmentationMode[] = [
  'Use Storyboard Scenes',
  'Split by Lyrics',
  'Split Every 5 Seconds',
  'Split Every 10 Seconds',
  'Split Every 15 Seconds',
  'Custom Segment Length',
];

const MAX_SEGMENTS = 100;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseTimestamp(ts: string): number | null {
  // Accepts "0:30", "1:20-1:40", "1:20 - 1:40" → returns start in seconds
  const clean = ts.trim().split(/[-–]/)[0].trim();
  const parts = clean.split(':').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  return null;
}

function parseTimestampEnd(ts: string): number | null {
  const parts = ts.trim().split(/[-–]/);
  if (parts.length < 2) return null;
  const endClean = parts[1].trim();
  const timeParts = endClean.split(':').map(Number);
  if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
    return timeParts[0] * 60 + timeParts[1];
  }
  return null;
}

function RenderStatusBadge({ status, fallback, simulated }: { status: VideoSegmentRenderStatus; fallback: boolean; simulated: boolean }) {
  if (status === 'Approved')
    return <Badge className="bg-[#10b981]/20 text-[#10b981] border-[#10b981]/30 font-mono text-[10px]">APPROVED</Badge>;
  if (status === 'Completed' || status === 'Browser Rendered' || status === 'Server Rendered')
    return <Badge className="bg-[#3b7eff]/20 text-[#3b7eff] border-[#3b7eff]/30 font-mono text-[10px]">RENDERED</Badge>;
  if (status === 'Preview Ready' || status === 'Simulated Preview')
    return (
      <Badge className="bg-[#8b5cf6]/20 text-[#a78bfa] border-[#8b5cf6]/30 font-mono text-[10px]">
        {simulated ? 'SIMULATED' : 'PREVIEW'}
      </Badge>
    );
  if (status === 'Failed')
    return <Badge className="bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/30 font-mono text-[10px]">FAILED</Badge>;
  if (fallback)
    return <Badge className="bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/30 font-mono text-[10px]">FALLBACK</Badge>;
  return <Badge className="bg-[#222] text-[#555] border-[#333] font-mono text-[10px]">NOT RENDERED</Badge>;
}

// ─── Single segment row ───────────────────────────────────────────────────────
function SegmentRow({
  seg,
  onPreview,
  onRender,
  onApprove,
  onRetry,
  renderingId,
}: {
  seg: VideoSegment;
  onPreview: (seg: VideoSegment) => void;
  onRender: (segId: string) => void;
  onApprove: (segId: string) => void;
  onRetry: (segId: string) => void;
  renderingId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const isRendering = renderingId === seg.id;

  return (
    <div
      className={`border rounded overflow-hidden transition-all ${
        seg.approved ? 'border-[#10b981]/30' : seg.failed ? 'border-[#ef4444]/25' : 'border-[#222]'
      }`}
      style={{ background: '#0e0e0e' }}
    >
      {/* Row header */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="font-mono text-[10px] text-[#3b7eff] font-bold shrink-0 w-6 text-right">
          {String(seg.segment_number).padStart(2, '0')}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs font-medium text-foreground truncate">
            {seg.segment_title || `Segment ${seg.segment_number}`}
          </p>
          <p className="font-mono text-[10px] text-[#555]">
            {formatTime(seg.start_time)} → {formatTime(seg.end_time)} · {seg.duration.toFixed(1)}s · {seg.motion_effect}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <RenderStatusBadge status={seg.render_status} fallback={seg.fallback_rendered} simulated={seg.simulated_preview} />
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-[#444] hover:text-foreground transition-colors shrink-0"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Image preview strip */}
      {seg.image_url && (
        <div className="px-3 pb-2">
          <div className="w-full h-14 rounded overflow-hidden bg-[#0a0a0a]">
            <img src={seg.image_url} alt={seg.segment_title || ''} className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-2 space-y-2">
          {seg.caption_text && (
            <div className="bg-[#1a1a1a] rounded px-2 py-1">
              <p className="font-mono text-[9px] text-[#555] uppercase tracking-widest mb-0.5">Caption</p>
              <p className="text-[10px] text-[#888]">{seg.caption_text}</p>
            </div>
          )}
          {seg.lyric_text && (
            <div className="bg-[#1a1a1a] rounded px-2 py-1">
              <p className="font-mono text-[9px] text-[#555] uppercase tracking-widest mb-0.5">Lyric</p>
              <p className="text-[10px] text-[#888] italic">{seg.lyric_text}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 text-[10px] font-mono text-[#555]">
            <span>Transition In: {seg.transition_in}</span>
            <span>·</span>
            <span>Transition Out: {seg.transition_out}</span>
          </div>
          {seg.error_message && (
            <div
              className="flex items-start gap-1.5 rounded px-2 py-1.5"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-red-400">{seg.error_message}</p>
            </div>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-[#181818] pt-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onPreview(seg)}
          disabled={!seg.image_url}
          className="text-[#8b5cf6] hover:text-violet-300 border border-[#8b5cf6]/25 font-mono text-[10px] h-6 px-2"
        >
          <Eye className="w-3 h-3 mr-1" />Preview
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRender(seg.id)}
          disabled={isRendering || seg.approved}
          className="text-[#3b7eff] hover:text-blue-300 border border-[#3b7eff]/25 font-mono text-[10px] h-6 px-2"
        >
          {isRendering ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
          Render Segment
        </Button>
        {!seg.approved && (seg.render_status !== 'Not Rendered' && seg.render_status !== 'Failed') && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onApprove(seg.id)}
            className="text-[#10b981] hover:text-emerald-300 border border-[#10b981]/25 font-mono text-[10px] h-6 px-2"
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />Approve
          </Button>
        )}
        {seg.failed && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRetry(seg.id)}
            className="text-[#f59e0b] hover:text-amber-300 border border-[#f59e0b]/25 font-mono text-[10px] h-6 px-2"
          >
            <RefreshCw className="w-3 h-3 mr-1" />Retry
          </Button>
        )}
        {seg.approved && (
          <span className="flex items-center gap-1 font-mono text-[10px] text-[#10b981] ml-1">
            <CheckCircle2 className="w-3 h-3" />Approved
          </span>
        )}
        {seg.simulated_preview && (
          <span className="font-mono text-[9px] text-[#555] ml-auto self-center">
            Manifest entry — use Render Browser Video for a playable draft
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Segment Preview Modal ────────────────────────────────────────────────────
function SegmentPreviewModal({ seg, onClose }: { seg: VideoSegment | null; onClose: () => void }) {
  if (!seg) return null;
  return (
    <AlertDialog open={!!seg} onOpenChange={open => !open && onClose()}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-mono text-sm">
            Segment {String(seg.segment_number).padStart(2, '0')} — {seg.segment_title || `Segment ${seg.segment_number}`}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-3">
          {seg.image_url ? (
            <div className="relative w-full aspect-video rounded overflow-hidden bg-[#0a0a0a]">
              <img src={seg.image_url} alt="" className="w-full h-full object-cover" />
              {/* Motion effect label overlay */}
              <div
                className="absolute bottom-3 left-3 font-mono text-[10px] px-2 py-0.5 rounded"
                style={{ background: 'rgba(0,0,0,0.7)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.4)' }}
              >
                {seg.motion_effect}
              </div>
              {/* Simulated label */}
              {seg.simulated_preview && (
                <div
                  className="absolute top-3 right-3 font-mono text-[9px] px-2 py-0.5 rounded"
                  style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
                >
                  Simulated Preview Segment
                </div>
              )}
            </div>
          ) : (
            <div
              className="w-full aspect-video rounded flex items-center justify-center"
              style={{ background: '#111' }}
            >
              <div className="text-center">
                <ImageIcon className="w-10 h-10 text-[#333] mx-auto mb-2" />
                <p className="font-mono text-xs text-[#555]">No image assigned to this segment</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            {[
              ['Time', `${formatTime(seg.start_time)} → ${formatTime(seg.end_time)}`],
              ['Duration', `${seg.duration.toFixed(1)}s`],
              ['Motion', seg.motion_effect],
              ['Transition In', seg.transition_in],
              ['Transition Out', seg.transition_out],
              ['Status', seg.render_status],
            ].map(([label, value]) => (
              <div key={label} className="bg-[#111] border border-[#222] rounded px-2 py-1.5">
                <p className="text-[9px] text-[#444] uppercase tracking-widest">{label}</p>
                <p className="text-foreground mt-0.5">{value}</p>
              </div>
            ))}
          </div>
          {seg.caption_text && (
            <div className="bg-[#111] border border-[#222] rounded px-3 py-2">
              <p className="font-mono text-[9px] text-[#444] uppercase tracking-widest mb-1">Caption</p>
              <p className="text-xs text-[#aaa]">{seg.caption_text}</p>
            </div>
          )}
          {seg.lyric_text && (
            <div className="bg-[#111] border border-[#222] rounded px-3 py-2">
              <p className="font-mono text-[9px] text-[#444] uppercase tracking-widest mb-1">Lyric</p>
              <p className="text-xs text-[#aaa] italic">{seg.lyric_text}</p>
            </div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Blocker Panel ────────────────────────────────────────────────────────────
function BlockerPanel({ title, blockers }: { title: string; blockers: string[] }) {
  const [open, setOpen] = useState(false);
  if (blockers.length === 0) return null;
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="font-semibold text-sm text-red-300">{title}</span>
          <Badge className="bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/30 font-mono text-[10px]">
            {blockers.length} blocker{blockers.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-red-400" /> : <ChevronDown className="w-4 h-4 text-red-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-1.5">
          {blockers.map((b, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="font-mono text-[10px] text-[#ef4444] shrink-0 mt-0.5">→</span>
              <p className="text-xs text-red-300">{b}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  project: Project;
  scenes: StoryboardScene[];
  sceneImages: SceneImage[];
  finalVideo: FinalVideo | null;
  onProjectUpdate: (updated: Partial<Project>) => void;
  onFinalVideoUpdate: (fv: FinalVideo) => void;
}

export default function SegmentedVideoRenderer({
  project,
  scenes,
  sceneImages,
  finalVideo,
  onProjectUpdate,
  onFinalVideoUpdate,
}: Props) {
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [segMode, setSegMode] = useState<SegmentationMode>('Split Every 10 Seconds');
  const [customLength, setCustomLength] = useState(10);
  const [songDuration, setSongDuration] = useState<number>(project.song_duration ?? 0);
  const [songDurationInput, setSongDurationInput] = useState(
    project.song_duration ? String(project.song_duration) : ''
  );
  const [creatingSegments, setCreatingSegments] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [renderingAll, setRenderingAll] = useState(false);
  const [renderingId, setRenderingId] = useState<string | null>(null);
  const [stitching, setStitching] = useState(false);
  const [previewSeg, setPreviewSeg] = useState<VideoSegment | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [showStitchConfirm, setShowStitchConfirm] = useState(false);

  // Browser video rendering state
  const [isBrowserRendering, setIsBrowserRendering] = useState(false);
  const [browserRenderProgress, setBrowserRenderProgress] = useState(0);
  const [browserRenderStatus, setBrowserRenderStatus] = useState<'idle' | 'rendering' | 'done' | 'unsupported' | 'failed'>('idle');
  const [browserWebmUrl, setBrowserWebmUrl] = useState<string | null>(
    finalVideo?.preview_video_url ?? null
  );
  const [browserRenderMessage, setBrowserRenderMessage] = useState<string | null>(null);
  const browserWebmUrlRef = useRef<string | null>(null);

  useEffect(() => {
    loadSegments();
  }, [project.id]);

  const loadSegments = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('video_segments')
      .select('*')
      .eq('project_id', project.id)
      .order('segment_number', { ascending: true });
    setSegments(Array.isArray(data) ? (data as VideoSegment[]) : []);
    setLoading(false);
  };

  // ── Coverage stats ──────────────────────────────────────────────────────────
  const effectiveDuration = songDuration || project.song_duration || 0;
  const activeSegs = segments.filter(s => s.active);
  const coveredDuration = activeSegs.reduce((acc, s) => acc + s.duration, 0);
  const coveragePct = effectiveDuration > 0 ? Math.min(100, (coveredDuration / effectiveDuration) * 100) : 0;
  const firstStart = activeSegs.length ? activeSegs[0].start_time : null;
  const lastEnd = activeSegs.length ? activeSegs[activeSegs.length - 1].end_time : null;

  // Detect timeline gaps
  const gaps: Array<{ from: number; to: number }> = [];
  for (let i = 0; i < activeSegs.length - 1; i++) {
    const gap = activeSegs[i + 1].start_time - activeSegs[i].end_time;
    if (gap > 0.5) gaps.push({ from: activeSegs[i].end_time, to: activeSegs[i + 1].start_time });
  }

  // ── Blocker detection ───────────────────────────────────────────────────────
  const imageBlockers = computeImageBlockers();
  const videoBlockers = computeVideoBlockers();

  function computeImageBlockers(): string[] {
    const blockers: string[] = [];
    const approvedImages = sceneImages.filter(
      si => si.approved && (si.real_generated || si.manual_upload || si.use_placeholder_as_draft_final)
    );
    scenes.forEach(sc => {
      const hasImg = approvedImages.some(si => si.storyboard_scene_id === sc.id);
      if (!hasImg) {
        const sceneImg = sceneImages.find(si => si.storyboard_scene_id === sc.id);
        if (!sceneImg) {
          blockers.push(`Scene ${sc.scene_number} has no image at all.`);
        } else if (sceneImg.placeholder && !sceneImg.use_placeholder_as_draft_final) {
          blockers.push(
            `Scene ${sc.scene_number} only has a placeholder preview. Click "Use Placeholder As Draft Final" to unlock it, or upload/generate a real image.`
          );
        } else if (!sceneImg.approved) {
          blockers.push(`Scene ${sc.scene_number} has an image but it has not been approved.`);
        }
      }
    });
    return blockers;
  }

  function computeVideoBlockers(): string[] {
    const blockers: string[] = [];
    if (!project.song_file) blockers.push('Audio file missing. Upload a song file to enable audio-linked video rendering.');
    if (effectiveDuration === 0) blockers.push('Song duration unknown. Enter the song duration manually to create segments.');
    if (segments.length === 0) blockers.push('No video segments created yet. Click "Create / Repair Segments" first.');
    if (gaps.length > 0) {
      gaps.forEach(g => blockers.push(`Timeline gap from ${formatTime(g.from)} to ${formatTime(g.to)}.`));
    }
    const failedSegs = segments.filter(s => s.failed);
    failedSegs.forEach(s =>
      blockers.push(`Segment ${s.segment_number} failed: ${s.error_message || 'unknown error'}.`)
    );
    if (segments.length > 0 && coveredDuration < effectiveDuration * 0.95) {
      blockers.push(
        `Song coverage is only ${Math.round(coveragePct)}% (${formatTime(coveredDuration)} of ${formatTime(effectiveDuration)}). Use "Create / Repair Segments" to cover the full song.`
      );
    }
    // Segment-level image missing
    segments.forEach(s => {
      if (!s.image_url) {
        blockers.push(`Segment ${s.segment_number} has no image assigned.`);
      }
    });
    return blockers;
  }

  // Separate browser-render blockers (audio absence is a warning, not a hard block)
  function computeBrowserRenderBlockers(): string[] {
    const blockers: string[] = [];
    if (typeof MediaRecorder === 'undefined') {
      blockers.push('MediaRecorder API is not available in this browser. Use Chrome or Edge for browser rendering.');
      return blockers; // No point checking further
    }
    const webmSupported = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].some(
      m => MediaRecorder.isTypeSupported(m)
    );
    if (!webmSupported) {
      blockers.push('WebM recording is not supported in this browser. Use Chrome or Edge for browser rendering.');
      return blockers;
    }
    if (segments.length === 0) blockers.push('No video segments created yet.');
    if (effectiveDuration === 0) blockers.push('Song duration unknown — enter the song duration above.');
    if (segments.length > 0 && coveredDuration < effectiveDuration * 0.95) {
      blockers.push(`Song coverage is only ${Math.round(coveragePct)}%. Use "Create / Repair Segments" to cover the full song.`);
    }
    return blockers;
  }

  // ── Save song duration ──────────────────────────────────────────────────────
  const handleSaveSongDuration = async () => {
    const val = parseFloat(songDurationInput);
    if (isNaN(val) || val <= 0) { toast.error('Enter a valid duration in seconds.'); return; }
    setSongDuration(val);
    await supabase.from('projects').update({ song_duration: val, updated_at: new Date().toISOString() }).eq('id', project.id);
    onProjectUpdate({ song_duration: val });
    toast.success('Song duration saved.');
  };

  // ── Create segments ─────────────────────────────────────────────────────────
  const handleCreateSegments = async () => {
    if (effectiveDuration === 0) {
      toast.error('Song duration unknown. Enter it above first.');
      return;
    }
    setCreatingSegments(true);

    // Build time ranges based on mode
    type TimeRange = { start: number; end: number; sceneId?: string; title?: string };
    let ranges: TimeRange[] = [];

    if (segMode === 'Use Storyboard Scenes') {
      scenes.forEach(sc => {
        const start = sc.timestamp_range ? (parseTimestamp(sc.timestamp_range) ?? 0) : 0;
        const end = sc.timestamp_range ? (parseTimestampEnd(sc.timestamp_range) ?? start + 10) : start + 10;
        ranges.push({ start, end: Math.min(end, effectiveDuration), sceneId: sc.id, title: sc.scene_title || `Scene ${sc.scene_number}` });
      });
    } else {
      const step = segMode === 'Split Every 5 Seconds' ? 5
        : segMode === 'Split Every 15 Seconds' ? 15
        : segMode === 'Custom Segment Length' ? customLength
        : 10; // default 10s
      let t = 0;
      while (t < effectiveDuration) {
        const end = Math.min(t + step, effectiveDuration);
        ranges.push({ start: t, end });
        t = end;
      }
    }

    // Cap at MAX_SEGMENTS
    if (ranges.length > MAX_SEGMENTS) ranges = ranges.slice(0, MAX_SEGMENTS);

    // Build approved image map: scene_id → image
    const approvedImgByScene: Record<string, SceneImage> = {};
    sceneImages
      .filter(si => si.approved && (si.real_generated || si.manual_upload || si.use_placeholder_as_draft_final))
      .forEach(si => { if (si.storyboard_scene_id) approvedImgByScene[si.storyboard_scene_id] = si; });

    // Fallback: best available image
    const fallbackImage = sceneImages.find(si => si.image_url) ?? null;

    // Delete old segments
    await supabase.from('video_segments').delete().eq('project_id', project.id);

    const motionEffects = [...MOTION_EFFECTS];
    const inserts = ranges.map((r, idx) => {
      // Find best scene match for this time range
      const matchedScene = scenes.find(sc => {
        const ts = sc.timestamp_range;
        if (!ts) return false;
        const start = parseTimestamp(ts) ?? 0;
        const end = parseTimestampEnd(ts) ?? start + 10;
        return r.start >= start && r.start < end;
      }) ?? null;

      const sceneId = r.sceneId ?? matchedScene?.id ?? null;
      const img = sceneId ? (approvedImgByScene[sceneId] ?? fallbackImage) : fallbackImage;

      return {
        project_id: project.id,
        segment_number: idx + 1,
        source_storyboard_scene_id: sceneId,
        source_scene_image_id: img?.id ?? null,
        start_time: r.start,
        end_time: r.end,
        duration: r.end - r.start,
        segment_title: r.title ?? matchedScene?.scene_title ?? `Segment ${idx + 1}`,
        image_url: img?.image_url ?? null,
        motion_effect: motionEffects[idx % motionEffects.length],
        transition_in: 'Fade',
        transition_out: 'Fade',
        caption_text: matchedScene?.lyric_moment ?? null,
        lyric_text: matchedScene?.lyric_moment ?? null,
        audio_start_time: r.start,
        audio_end_time: r.end,
        render_status: 'Not Rendered',
        fallback_rendered: false,
        provider_rendered: false,
        simulated_preview: false,
        approved: false,
        active: true,
        pending: false,
        failed: false,
      };
    });

    const { error } = await supabase.from('video_segments').insert(inserts);
    if (error) {
      toast.error(`Failed to create segments: ${error.message}`);
    } else {
      toast.success(`Created ${inserts.length} video segment${inserts.length !== 1 ? 's' : ''} covering ${formatTime(effectiveDuration)}.`);
      await loadSegments();
    }
    setCreatingSegments(false);
  };

  // ── Repair segments: fill gaps, reassign missing images ────────────────────
  // Does NOT delete existing approved segments. Only inserts filler for uncovered ranges
  // and updates segments that have no image_url assigned.
  const handleRepairSegments = async () => {
    if (effectiveDuration === 0) {
      toast.error('Song duration unknown. Enter it above first.');
      return;
    }
    if (segments.length === 0) {
      // Nothing to repair — just create fresh
      return handleCreateSegments();
    }
    setRepairing(true);

    // Build approved image pool for fallback assignment
    const approvedImgByScene: Record<string, SceneImage> = {};
    sceneImages
      .filter(si => si.approved && (si.real_generated || si.manual_upload || si.use_placeholder_as_draft_final))
      .forEach(si => { if (si.storyboard_scene_id) approvedImgByScene[si.storyboard_scene_id] = si; });
    const fallbackImage = sceneImages.find(si => si.image_url) ?? null;
    const motionEffects = [...MOTION_EFFECTS];
    let repaired = 0;

    // 1. Fix segments that are missing an image_url
    const missingImg = segments.filter(s => !s.image_url);
    for (const seg of missingImg) {
      const matchImg = seg.source_storyboard_scene_id
        ? (approvedImgByScene[seg.source_storyboard_scene_id] ?? fallbackImage)
        : fallbackImage;
      if (matchImg?.image_url) {
        const { error } = await supabase.from('video_segments')
          .update({
            image_url: matchImg.image_url,
            source_scene_image_id: matchImg.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', seg.id);

        if (error) {
          console.error('Failed to repair segment image:', error);
          toast.error(`Failed to repair segment image: ${error.message}`);
        } else {
          repaired++;
        }
      }
    }

    // 2. Fill gaps by inserting filler segments
    const sorted = [...segments].filter(s => s.active).sort((a, b) => a.start_time - b.start_time);
    type TimeRange = { start: number; end: number };
    const gapRanges: TimeRange[] = [];

    // Gap before first segment
    if (sorted.length > 0 && sorted[0].start_time > 0.5) {
      gapRanges.push({ start: 0, end: sorted[0].start_time });
    }
    // Gaps between segments
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].start_time - sorted[i].end_time;
      if (gap > 0.5) gapRanges.push({ start: sorted[i].end_time, end: sorted[i + 1].start_time });
    }
    // Gap after last segment
    if (sorted.length > 0 && effectiveDuration - sorted[sorted.length - 1].end_time > 0.5) {
      gapRanges.push({ start: sorted[sorted.length - 1].end_time, end: effectiveDuration });
    }

    if (gapRanges.length > 0) {
      const maxSegNum = segments.reduce((m, s) => Math.max(m, s.segment_number), 0);
      const fillerInserts = gapRanges.map((r, idx) => {
        const img = fallbackImage;
        return {
          project_id: project.id,
          segment_number: maxSegNum + idx + 1,
          source_scene_image_id: img?.id ?? null,
          start_time: r.start,
          end_time: r.end,
          duration: r.end - r.start,
          segment_title: `Filler ${idx + 1} (${formatTime(r.start)}–${formatTime(r.end)})`,
          image_url: img?.image_url ?? null,
          motion_effect: motionEffects[(maxSegNum + idx) % motionEffects.length],
          transition_in: 'Fade',
          transition_out: 'Fade',
          caption_text: null,
          lyric_text: null,
          audio_start_time: r.start,
          audio_end_time: r.end,
          render_status: 'Not Rendered',
          fallback_rendered: false,
          provider_rendered: false,
          simulated_preview: false,
          approved: false,
          active: true,
          pending: false,
          failed: false,
        };
      });
      const { error } = await supabase.from('video_segments').insert(fillerInserts);

      if (error) {
        console.error('Failed to insert filler segments:', error);
        toast.error(`Failed to insert filler segments: ${error.message}`);
      } else {
        repaired += fillerInserts.length;
      }
    }

    await loadSegments();
    setRepairing(false);
    if (repaired > 0) {
      toast.success(`Repaired ${repaired} issue${repaired !== 1 ? 's' : ''}: gaps filled, missing images assigned.`);
    } else {
      toast.success('Segments look good — no repairs needed.');
    }
  };
  const renderSegmentFallback = useCallback(async (segId: string): Promise<void> => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('video_segments')
      .update({
        render_status: 'Simulated Preview',
        fallback_rendered: true,
        simulated_preview: true,
        pending: false,
        failed: false,
        updated_at: now,
      })
      .eq('id', segId);
    if (error) {
      await supabase.from('video_segments').update({
        render_status: 'Failed',
        failed: true,
        error_message: error.message,
        updated_at: now,
      }).eq('id', segId);
      setSegments(prev =>
        prev.map(s => s.id === segId ? { ...s, render_status: 'Failed' as VideoSegmentRenderStatus, failed: true, error_message: error.message } : s)
      );
      throw error;
    }
    setSegments(prev =>
      prev.map(s => s.id === segId
        ? { ...s, render_status: 'Simulated Preview' as VideoSegmentRenderStatus, fallback_rendered: true, simulated_preview: true, pending: false, failed: false }
        : s
      )
    );
  }, []);

  const handleRenderSingle = async (segId: string) => {
    setRenderingId(segId);
    try {
      await renderSegmentFallback(segId);
      toast.success('Segment rendered as Simulated Preview — fallback mode.');
    } catch {
      toast.error('Segment render failed.');
    }
    setRenderingId(null);
  };

  // ── Render all segments ─────────────────────────────────────────────────────
  const handleRenderAll = async () => {
    if (segments.length === 0) { toast.error('No segments to render.'); return; }
    setRenderingAll(true);
    const toRender = segments.filter(s =>
      s.active &&
      !s.approved &&
      (s.render_status === 'Not Rendered' || s.failed || s.simulated_preview || s.fallback_rendered)
    );
    let success = 0;
    for (const seg of toRender) {
      setRenderingId(seg.id);
      try {
        await renderSegmentFallback(seg.id);
        success++;
      } catch {
        // continue with remaining
      }
    }
    setRenderingId(null);
    setRenderingAll(false);
    toast.success(`Rendered ${success} of ${toRender.length} segments using fallback image-motion preview.`);
  };

  // ── Approve segment ─────────────────────────────────────────────────────────
  const handleApproveSegment = async (segId: string) => {
    const now = new Date().toISOString();
    await supabase.from('video_segments').update({
      approved: true,
      pending: false,
      failed: false,
      render_status: 'Approved',
      updated_at: now,
    }).eq('id', segId);
    setSegments(prev => prev.map(s => s.id === segId ? { ...s, approved: true, pending: false, failed: false, render_status: 'Approved' as VideoSegmentRenderStatus } : s));
    toast.success('Segment approved.');
  };

  // ── Retry failed segment ────────────────────────────────────────────────────
  const handleRetrySegment = async (segId: string) => {
    await supabase.from('video_segments').update({ render_status: 'Not Rendered', failed: false, error_message: null, updated_at: new Date().toISOString() }).eq('id', segId);
    setSegments(prev => prev.map(s => s.id === segId ? { ...s, render_status: 'Not Rendered' as VideoSegmentRenderStatus, failed: false, error_message: null } : s));
    await handleRenderSingle(segId);
  };

  // ── Stitch full video ───────────────────────────────────────────────────────
  const handleStitch = async () => {
    setStitching(true);
    const now = new Date().toISOString();

    // Build render manifest
    const manifest: RenderManifest = {
      project_title: project.title,
      song_file_name: project.song_file_name,
      song_duration: effectiveDuration,
      segment_count: activeSegs.length,
      segments: activeSegs
        .sort((a, b) => a.segment_number - b.segment_number)
        .map((s): RenderManifestSegment => ({
          segment_number: s.segment_number,
          start_time: s.start_time,
          end_time: s.end_time,
          duration: s.duration,
          segment_title: s.segment_title,
          image_url: s.image_url,
          motion_effect: s.motion_effect,
          transition_in: s.transition_in,
          transition_out: s.transition_out,
          caption_text: s.caption_text,
          lyric_text: s.lyric_text,
          storyboard_scene_source: s.source_storyboard_scene_id,
          approved: s.approved,
          render_status: s.render_status,
        })),
      generated_at: now,
    };

    const manifestJson = JSON.stringify(manifest, null, 2);
    const blob = new Blob([manifestJson], { type: 'application/json' });
    const path = `render-manifests/${project.id}/manifest-${Date.now()}.json`;

    // Upload manifest to storage
    let manifestUrl: string | null = null;
    try {
      await supabase.storage.from('render-manifests').upload(path, blob, { upsert: true });
      const { data: urlData } = supabase.storage.from('render-manifests').getPublicUrl(path);
      manifestUrl = urlData.publicUrl;
    } catch {
      // Manifest URL not critical — proceed anyway
    }

    // Upsert final_videos record
    const fvPayload = {
      project_id: project.id,
      title: project.title,
      render_status: 'Preview Ready',
      downloadable: false,
      segment_count: activeSegs.length,
      render_manifest_url: manifestUrl,
      duration: effectiveDuration,
      audio_file: project.song_file,
      updated_at: now,
    };

    const { data: existingFv } = await supabase
      .from('final_videos')
      .select('id')
      .eq('project_id', project.id)
      .maybeSingle();

    let fvResult;
    if (existingFv) {
      fvResult = await supabase.from('final_videos').update(fvPayload).eq('id', existingFv.id).select().maybeSingle();
    } else {
      fvResult = await supabase.from('final_videos').insert(fvPayload).select().maybeSingle();
    }

    if (fvResult?.data) onFinalVideoUpdate(fvResult.data as FinalVideo);

    setStitching(false);
    setShowFullPreview(true);
    toast.success('Full video preview assembled! Render manifest exported.');
  };

  // ── Browser video rendering (canvas + MediaRecorder) ───────────────────────
  // Produces a real WebM blob from canvas frames + scene images + captions.
  // Audio is captured separately from an <audio> element if available.
  // Falls back gracefully if MediaRecorder or captureStream are unavailable.
  const handleBrowserRender = async () => {
    // 1. Check MediaRecorder support and pick best available codec
    if (typeof MediaRecorder === 'undefined') {
      setBrowserRenderStatus('unsupported');
      setBrowserRenderMessage(
        'MediaRecorder API is not available in this browser. Export the Render Manifest instead, or use Chrome/Edge for browser rendering.'
      );
      toast.error('MediaRecorder not available in this browser. Try Chrome or Edge.');
      return;
    }

    const WEBM_CODECS = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const supportedMime = WEBM_CODECS.find(m => MediaRecorder.isTypeSupported(m));
    if (!supportedMime) {
      setBrowserRenderStatus('unsupported');
      setBrowserRenderMessage(
        'This browser does not support WebM video recording. Export the Render Manifest or use Chrome/Edge for browser rendering.'
      );
      toast.error('WebM recording not supported on this device. Try Chrome or Edge.');
      return;
    }
    const browserBlockers = computeBrowserRenderBlockers();
    if (browserBlockers.length > 0) {
      toast.error(browserBlockers[0]);
      return;
    }

    setIsBrowserRendering(true);
    setBrowserRenderStatus('rendering');
    setBrowserRenderProgress(0);
    setBrowserRenderMessage(null);

    // Clean up previous blob URL
    if (browserWebmUrlRef.current) {
      URL.revokeObjectURL(browserWebmUrlRef.current);
      browserWebmUrlRef.current = null;
    }
    setBrowserWebmUrl(null);

    // 2. Constants
    const FPS = 25;
    const W = 1280;
    const H = 720;
    const FONT_CAPTION = 'bold 28px monospace';
    const FONT_SCENE = '18px monospace';

    // 3. Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setBrowserRenderStatus('failed');
      setBrowserRenderMessage('Could not create canvas 2D context.');
      setIsBrowserRendering(false);
      return;
    }

    // 4. Preload all images (ImageBitmap for fast draw)
    const sortedSegs = [...activeSegs].sort((a, b) => a.segment_number - b.segment_number);
    const imgBitmaps: Map<string, ImageBitmap> = new Map();

    for (const seg of sortedSegs) {
      if (seg.image_url && !imgBitmaps.has(seg.image_url)) {
        try {
          const resp = await fetch(seg.image_url);
          const blob = await resp.blob();
          imgBitmaps.set(seg.image_url, await createImageBitmap(blob));
        } catch {
          // Non-fatal: will render solid colour for this segment
        }
      }
    }

    // 5. Set up MediaRecorder on canvas stream
    const canvasStream = canvas.captureStream(FPS);

    // Attempt to attach audio from a hidden <audio> element if song_file exists
    let audioCtx: AudioContext | null = null;
    let audioSource: MediaElementAudioSourceNode | null = null;
    let audioDestination: MediaStreamAudioDestinationNode | null = null;
    let audioEl: HTMLAudioElement | null = null;
    let audioAttached = false;

    if (project.song_file) {
      try {
        audioEl = document.createElement('audio');
        audioEl.src = project.song_file;
        audioEl.crossOrigin = 'anonymous';
        audioCtx = new AudioContext();
        audioSource = audioCtx.createMediaElementSource(audioEl);
        audioDestination = audioCtx.createMediaStreamDestination();
        audioSource.connect(audioDestination);
        audioSource.connect(audioCtx.destination);
        const audioTracks = audioDestination.stream.getAudioTracks();
        audioTracks.forEach(t => canvasStream.addTrack(t));
        audioAttached = true;
      } catch {
        // Audio attachment failed — continue without audio
        audioAttached = false;
      }
    }

    const recorder = new MediaRecorder(canvasStream, {
      mimeType: supportedMime,
      videoBitsPerSecond: 4_000_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    // 6. Start recording + audio playback
    recorder.start(200); // emit data every 200ms
    if (audioEl && audioAttached) {
      audioEl.currentTime = 0;
      audioEl.play().catch(() => {});
    }

    // 7. Draw frames segment by segment
    const totalDuration = sortedSegs.reduce((acc, s) => acc + s.duration, 0);
    let elapsed = 0;

    for (let si = 0; si < sortedSegs.length; si++) {
      const seg = sortedSegs[si];
      const segFrames = Math.max(1, Math.round(seg.duration * FPS));
      const bmp = seg.image_url ? imgBitmaps.get(seg.image_url) ?? null : null;

      for (let f = 0; f < segFrames; f++) {
        const t = f / segFrames; // 0..1 progress within segment

        // Clear
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, W, H);

        if (bmp) {
          // Apply motion effect as a canvas transform
          const effect = seg.motion_effect ?? 'slow zoom in';
          ctx.save();
          switch (effect) {
            case 'slow zoom in': {
              const scale = 1 + t * 0.08;
              ctx.translate(W / 2, H / 2);
              ctx.scale(scale, scale);
              ctx.translate(-W / 2, -H / 2);
              break;
            }
            case 'slow zoom out': {
              const scale = 1.08 - t * 0.08;
              ctx.translate(W / 2, H / 2);
              ctx.scale(scale, scale);
              ctx.translate(-W / 2, -H / 2);
              break;
            }
            case 'pan left': {
              const offset = -t * 40;
              ctx.translate(offset, 0);
              break;
            }
            case 'pan right': {
              const offset = t * 40;
              ctx.translate(offset, 0);
              break;
            }
            case 'subtle shake': {
              ctx.translate(Math.sin(f * 0.8) * 3, Math.cos(f * 0.9) * 2);
              break;
            }
            case 'beat pulse': {
              const pulse = 1 + Math.sin(f * 0.5) * 0.015;
              ctx.translate(W / 2, H / 2);
              ctx.scale(pulse, pulse);
              ctx.translate(-W / 2, -H / 2);
              break;
            }
            case 'glitch flicker': {
              if (f % 7 < 2) ctx.translate((Math.random() - 0.5) * 8, 0);
              break;
            }
            case 'flash': {
              // handled after drawImage via overlay
              break;
            }
            default:
              break;
          }
          ctx.drawImage(bmp, 0, 0, W, H);
          ctx.restore();

          // Flash overlay
          if (effect === 'flash') {
            const flashAlpha = t < 0.1 ? (1 - t / 0.1) * 0.6 : 0;
            if (flashAlpha > 0) {
              ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
              ctx.fillRect(0, 0, W, H);
            }
          }

          // Fade-in / fade-out at segment boundaries
          if (t < 0.08) {
            ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.08})`;
            ctx.fillRect(0, 0, W, H);
          } else if (t > 0.92) {
            ctx.fillStyle = `rgba(0,0,0,${(t - 0.92) / 0.08})`;
            ctx.fillRect(0, 0, W, H);
          }
        } else {
          // No image — gradient placeholder
          const grad = ctx.createLinearGradient(0, 0, W, H);
          grad.addColorStop(0, '#0d1117');
          grad.addColorStop(1, '#1a1a2e');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, W, H);
        }

        // Scene title overlay (top-left)
        if (seg.segment_title) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(16, 14, 420, 32);
          ctx.font = FONT_SCENE;
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.fillText(seg.segment_title.slice(0, 48), 24, 36);
        }

        // Caption overlay (bottom centre)
        const captionText = seg.caption_text || seg.lyric_text;
        if (captionText) {
          ctx.font = FONT_CAPTION;
          const textW = Math.min(ctx.measureText(captionText).width + 40, W - 80);
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.fillRect((W - textW) / 2, H - 80, textW, 48);
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(captionText.slice(0, 60), W / 2, H - 47);
          ctx.textAlign = 'left';
        }

        // Timecode (bottom-right, small)
        ctx.font = '13px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.textAlign = 'right';
        ctx.fillText(formatTime(seg.start_time + (f / FPS)), W - 16, H - 16);
        ctx.textAlign = 'left';

        // Yield to browser between frames (prevents blocking)
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }

      elapsed += seg.duration;
      setBrowserRenderProgress(Math.round((elapsed / totalDuration) * 95));
    }

    // 8. Stop recording and collect blob
    await new Promise<void>(resolve => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    if (audioEl) { audioEl.pause(); audioEl.src = ''; }
    if (audioCtx) { try { await audioCtx.close(); } catch {} }

    setBrowserRenderProgress(97);

    const webmBlob = new Blob(chunks, { type: supportedMime || 'video/webm' });
    if (webmBlob.size < 512) {
      setBrowserRenderStatus('failed');
      setBrowserRenderMessage('Rendered video file is empty. Try a different browser or check your scene images.');
      setIsBrowserRendering(false);
      toast.error('Browser video render produced an empty file.');
      return;
    }

    // 9. Create local download URL
    const objectUrl = URL.createObjectURL(webmBlob);
    browserWebmUrlRef.current = objectUrl;
    setBrowserWebmUrl(objectUrl);
    setBrowserRenderProgress(99);

    // 10. Attempt to upload to Supabase storage and persist to final_videos
    let storedUrl: string | null = null;
    try {
      const storagePath = `browser-renders/${project.id}/preview-${Date.now()}.webm`;
      const { error: uploadErr } = await supabase.storage
        .from('render-manifests')
        .upload(storagePath, webmBlob, { upsert: true, contentType: 'video/webm' });
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('render-manifests').getPublicUrl(storagePath);
        storedUrl = urlData.publicUrl;
      }
    } catch {
      // Non-fatal: local URL still works for download
    }

    const now = new Date().toISOString();
    const fvPayload = {
      project_id: project.id,
      title: project.title,
      render_status: 'Browser Rendered',
      downloadable: true,
      segment_count: sortedSegs.length,
      duration: effectiveDuration,
      audio_file: project.song_file ?? null,
      preview_video_url: storedUrl ?? null,
      video_url: storedUrl ?? null,
      updated_at: now,
    };

    const { data: existingFv } = await supabase
      .from('final_videos').select('id').eq('project_id', project.id).maybeSingle();
    let fvResult;
    if (existingFv) {
      fvResult = await supabase.from('final_videos').update(fvPayload).eq('id', existingFv.id).select().maybeSingle();
    } else {
      fvResult = await supabase.from('final_videos').insert(fvPayload).select().maybeSingle();
    }
    if (fvResult?.data) onFinalVideoUpdate(fvResult.data as FinalVideo);

    setBrowserRenderProgress(100);
    setBrowserRenderStatus('done');
    if (!audioAttached && project.song_file) {
      setBrowserRenderMessage(
        'Video rendered without audio because browser audio capture was unavailable. Download the WebM and add audio in a video editor, or connect a server renderer for MP4.'
      );
      toast.warning('Browser video rendered (no audio). Download WebM below.');
    } else if (!project.song_file) {
      setBrowserRenderMessage('Video rendered without audio — no song file was uploaded.');
      toast.success('Browser video rendered (no audio — no song file uploaded).');
    } else {
      setBrowserRenderMessage(null);
      toast.success('Browser video rendered! Download your WebM draft below.');
    }
    setIsBrowserRendering(false);
  };

  // ── Export render manifest ──────────────────────────────────────────────────
  const handleExportManifest = () => {    const manifest: RenderManifest = {
      project_title: project.title,
      song_file_name: project.song_file_name,
      song_duration: effectiveDuration || null,
      segment_count: activeSegs.length,
      segments: activeSegs.sort((a, b) => a.segment_number - b.segment_number).map((s): RenderManifestSegment => ({
        segment_number: s.segment_number,
        start_time: s.start_time,
        end_time: s.end_time,
        duration: s.duration,
        segment_title: s.segment_title,
        image_url: s.image_url,
        motion_effect: s.motion_effect,
        transition_in: s.transition_in,
        transition_out: s.transition_out,
        caption_text: s.caption_text,
        lyric_text: s.lyric_text,
        storyboard_scene_source: s.source_storyboard_scene_id,
        approved: s.approved,
        render_status: s.render_status,
      })),
      generated_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title.replace(/[^a-z0-9]/gi, '_')}_render_manifest.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Render manifest downloaded.');
  };

  // ── Stats ───────────────────────────────────────────────────────────────────
  const notRendered = segments.filter(s => s.render_status === 'Not Rendered').length;
  const rendered = segments.filter(s => s.render_status !== 'Not Rendered' && s.render_status !== 'Failed').length;
  const approved = segments.filter(s => s.approved).length;
  const failed = segments.filter(s => s.failed).length;
  const renderableSegments = segments.filter(s =>
    s.active &&
    !s.approved &&
    (s.render_status === 'Not Rendered' || s.failed || s.simulated_preview || s.fallback_rendered)
  ).length;

  const canStitch = segments.length > 0 && videoBlockers.length === 0;
  const browserBlockers = computeBrowserRenderBlockers();
  const canBrowserRender = browserBlockers.length === 0 && !isBrowserRendering;
  const sortedSegsForDisplay = [...activeSegs].sort((a, b) => a.segment_number - b.segment_number);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
        <Loader2 className="w-4 h-4 animate-spin" />Loading segments…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Credit-Safe notice */}
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3 border"
        style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)' }}
      >
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <div>
          <span className="font-semibold text-sm text-emerald-300">Credit-Safe Mode: ON</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            No external video provider is called. <strong className="text-foreground">Render Browser Video</strong> produces a real
            playable WebM using your browser's canvas and MediaRecorder. MP4 export requires a server renderer — available later.
          </p>
        </div>
      </div>

      {/* Song Duration */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Music className="w-4 h-4" />Song Duration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-sm font-normal">Duration (seconds)</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={songDurationInput}
                onChange={e => setSongDurationInput(e.target.value)}
                placeholder="e.g. 213 for 3:33"
                className="max-w-xs"
              />
              {effectiveDuration > 0 && (
                <p className="text-xs text-muted-foreground font-mono">= {formatTime(effectiveDuration)}</p>
              )}
            </div>
            <Button onClick={handleSaveSongDuration} size="sm" variant="secondary" className="shrink-0">
              Save Duration
            </Button>
          </div>
          {project.song_file_name && (
            <p className="text-xs text-muted-foreground">
              Song file: <span className="font-mono text-foreground">{project.song_file_name}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Segmentation settings */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Scissors className="w-4 h-4" />Segmentation Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-sm font-normal">Segmentation Mode</Label>
              <Select value={segMode} onValueChange={v => setSegMode(v as SegmentationMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEGMENTATION_MODES.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {segMode === 'Custom Segment Length' && (
              <div className="space-y-1">
                <Label className="text-sm font-normal">Custom Length (seconds)</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={customLength}
                  onChange={e => setCustomLength(Number(e.target.value))}
                  className="max-w-[140px]"
                />
              </div>
            )}
          </div>
          <div
            className="flex items-start gap-2 rounded-lg px-3 py-2"
            style={{ background: 'rgba(59,126,255,0.06)', border: '1px solid rgba(59,126,255,0.15)' }}
          >
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300">
              Maximum {MAX_SEGMENTS} segments per project. Each segment will be assigned an approved scene image
              and motion effect. Missing images will be filled with the nearest available approved image.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleCreateSegments}
              disabled={creatingSegments || repairing || effectiveDuration === 0}
              className="gap-2"
            >
              {creatingSegments ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />}
              Create Video Segments
              {effectiveDuration > 0 && ` — Covers ${formatTime(effectiveDuration)}`}
            </Button>
            {segments.length > 0 && (
              <Button
                variant="secondary"
                onClick={handleRepairSegments}
                disabled={repairing || creatingSegments}
                className="gap-2"
              >
                {repairing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                Create / Repair Segments
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Full Song Coverage */}
      {effectiveDuration > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />Full Song Coverage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={coveragePct} className="h-2" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: 'Song Duration', value: formatTime(effectiveDuration) },
                { label: 'Covered', value: formatTime(coveredDuration) },
                { label: 'Segments', value: String(segments.length) },
                { label: 'Coverage', value: `${Math.round(coveragePct)}%` },
              ].map(item => (
                <div
                  key={item.label}
                  className="rounded-lg px-3 py-2 border"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}
                >
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                  <p className="text-sm font-semibold mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
            {firstStart !== null && lastEnd !== null && (
              <p className="font-mono text-xs text-muted-foreground">
                First segment: {formatTime(firstStart)} · Last segment ends: {formatTime(lastEnd)}
              </p>
            )}
            {gaps.length > 0 && (
              <div
                className="rounded-lg px-3 py-2"
                style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <p className="font-mono text-xs text-red-400 font-semibold mb-1">
                  {gaps.length} timeline gap{gaps.length !== 1 ? 's' : ''} detected
                </p>
                {gaps.map((g, i) => (
                  <p key={i} className="font-mono text-[10px] text-red-300">
                    → Gap: {formatTime(g.from)} to {formatTime(g.to)}
                  </p>
                ))}
              </div>
            )}
            {coveragePct >= 99 && gaps.length === 0 && (
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)' }}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <p className="text-xs text-emerald-400 font-semibold">Full song covered — no gaps detected.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Blocker Panels */}
      <BlockerPanel title="Why Can't I Generate Scene Images?" blockers={imageBlockers} />
      <BlockerPanel title="Why Can't I Render Full Video?" blockers={videoBlockers} />

      {/* Browser Video Render Panel */}
      {segments.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MonitorPlay className="w-4 h-4 text-violet-400" />
              Render Browser Video (WebM)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Renders a real playable WebM video directly in your browser using canvas + MediaRecorder.
              Draws each segment image with motion effects and captions, overlays song audio where available.
              <strong className="text-foreground"> No external API is called. No credits used.</strong>
            </p>

            {/* Blockers for browser render */}
            {browserBlockers.length > 0 && (
              <div className="rounded-lg px-3 py-2 space-y-1" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {browserBlockers.map((b, i) => (
                  <p key={i} className="text-xs text-red-300 flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-red-400" />{b}
                  </p>
                ))}
              </div>
            )}

            {/* Audio warning */}
            {!project.song_file && (
              <div className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">
                  No song file uploaded. Browser video will render without audio. Upload a song file to include audio.
                </p>
              </div>
            )}

            {/* Render progress */}
            {isBrowserRendering && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">Rendering frames…</span>
                  <span className="font-mono text-xs text-muted-foreground">{browserRenderProgress}%</span>
                </div>
                <Progress value={browserRenderProgress} className="h-2" />
                <p className="text-[10px] text-muted-foreground font-mono">
                  This may take a minute for long videos. Do not close this tab.
                </p>
              </div>
            )}

            {/* Result message */}
            {browserRenderMessage && (
              <div
                className="flex items-start gap-2 rounded-lg px-3 py-2"
                style={
                  browserRenderStatus === 'done'
                    ? { background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)' }
                    : { background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }
                }
              >
                {browserRenderStatus === 'done'
                  ? <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  : <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                }
                <p className={`text-xs ${browserRenderStatus === 'done' ? 'text-emerald-300' : 'text-red-300'}`}>
                  {browserRenderMessage}
                </p>
              </div>
            )}

            {/* Unsupported message */}
            {browserRenderStatus === 'unsupported' && (
              <div className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">
                  Browser MediaRecorder is not supported on this device. Export the Render Manifest instead, or open this app in Chrome or Firefox on desktop.
                </p>
              </div>
            )}

            {/* WebM download */}
            {browserRenderStatus === 'done' && browserWebmUrl && (
              <div className="flex flex-wrap gap-2 items-center">
                <Button asChild className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                  <a href={browserWebmUrl} download={`${project.title.replace(/[^a-z0-9]/gi, '_')}_draft.webm`}>
                    <Download className="w-3.5 h-3.5" />Download WebM Draft
                  </a>
                </Button>
                <span className="font-mono text-[10px] text-muted-foreground">
                  WebM · Browser render · {sortedSegsForDisplay.length} segments · {formatTime(coveredDuration)}
                </span>
              </div>
            )}

            {/* MP4 note */}
            <div className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(59,126,255,0.06)', border: '1px solid rgba(59,126,255,0.15)' }}>
              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-300">
                <strong className="text-foreground">WebM</strong> is the browser-rendered draft format.{' '}
                <strong className="text-foreground">MP4</strong> export requires a server renderer (available later).
                The <strong className="text-foreground">Render Manifest</strong> is your production data — it always remains available.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleBrowserRender}
                disabled={!canBrowserRender || browserRenderStatus === 'unsupported'}
                className="gap-2"
                style={{ background: canBrowserRender ? '#7c3aed' : undefined }}
              >
                {isBrowserRendering
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Rendering…</>
                  : <><Video className="w-3.5 h-3.5" />Render Browser Video</>
                }
              </Button>
              {browserRenderStatus === 'done' && (
                <Button variant="secondary" onClick={handleBrowserRender} className="gap-2">
                  <RefreshCw className="w-3.5 h-3.5" />Re-render
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Render controls */}
      {segments.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Film className="w-4 h-4" />Segment Rendering
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: 'Total', value: segments.length, color: undefined },
                { label: 'Rendered', value: rendered, color: '#3b7eff' },
                { label: 'Approved', value: approved, color: '#10b981' },
                { label: 'Failed', value: failed, color: '#ef4444' },
              ].map(item => (
                <div
                  key={item.label}
                  className="rounded-lg px-3 py-2 border text-center"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}
                >
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                  <p className="text-xl font-bold mt-0.5" style={{ color: item.color }}>{item.value}</p>
                </div>
              ))}
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleRenderAll}
                disabled={renderingAll || renderableSegments === 0}
                className="gap-2"
              >
                {renderingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Mark All Segments Ready
              </Button>

              <Button
                variant="secondary"
                onClick={() => setShowStitchConfirm(true)}
                disabled={!canStitch || stitching}
                className="gap-2"
              >
                {stitching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clapperboard className="w-3.5 h-3.5" />}
                Export Render Manifest
              </Button>

              <Button
                variant="secondary"
                onClick={handleExportManifest}
                disabled={segments.length === 0}
                className="gap-2"
              >
                <FileJson className="w-3.5 h-3.5" />
                Download Render Manifest
              </Button>
            </div>

            {!project.song_file && (
              <div
                className="flex items-start gap-2 rounded-lg px-3 py-2"
                style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">
                  Audio file missing. Upload your song file to include audio in video rendering.
                </p>
              </div>
            )}

            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2"
              style={{ background: 'rgba(59,126,255,0.07)', border: '1px solid rgba(59,126,255,0.15)' }}
            >
              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-300">
                <strong className="text-foreground">Render Manifest</strong> is production data — segment order, images, effects, captions, and timing.
                Use <strong className="text-foreground">Render Browser Video</strong> (above) to produce a real playable <strong className="text-foreground">WebM draft</strong>.
                <strong className="text-foreground"> MP4</strong> export requires a server renderer, available when you connect one later.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Segment list */}
      {segments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" />{segments.length} Segments
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={loadSegments}
              className="h-7 font-mono text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              <RefreshCw className="w-3 h-3" />Refresh
            </Button>
          </div>
          <div className="space-y-1.5">
            {segments.map(seg => (
              <SegmentRow
                key={seg.id}
                seg={seg}
                onPreview={setPreviewSeg}
                onRender={handleRenderSingle}
                onApprove={handleApproveSegment}
                onRetry={handleRetrySegment}
                renderingId={renderingId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {segments.length === 0 && !loading && (
        <div
          className="rounded-xl p-10 text-center"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Clapperboard className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-mono text-sm text-muted-foreground mb-1">No video segments yet.</p>
          <p className="text-xs text-muted-foreground">
            Enter the song duration above and click "Create Video Segments" to build your full video plan.
          </p>
        </div>
      )}

      {/* Final video status */}
      {finalVideo && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Play className="w-4 h-4" />Final Video Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[
                { label: 'Status', value: finalVideo.render_status },
                { label: 'Segments', value: String(finalVideo.segment_count ?? '—') },
                { label: 'Duration', value: finalVideo.duration ? formatTime(finalVideo.duration) : '—' },
              ].map(item => (
                <div
                  key={item.label}
                  className="rounded-lg px-3 py-2 border"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}
                >
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                  <p className="text-sm font-semibold mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>

            {/* WebM download (browser-rendered) */}
            {(finalVideo.render_status === 'Browser Rendered') && (finalVideo.video_url || browserWebmUrl) && (
              <Button asChild className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                <a
                  href={browserWebmUrl ?? finalVideo.video_url ?? ''}
                  download={`${project.title.replace(/[^a-z0-9]/gi, '_')}_draft.webm`}
                >
                  <Download className="w-3.5 h-3.5" />Download WebM Draft
                </a>
              </Button>
            )}

            {/* Server-rendered MP4 download */}
            {finalVideo.downloadable && finalVideo.video_url && finalVideo.render_status !== 'Browser Rendered' && (
              <Button asChild size="sm" className="gap-2">
                <a href={finalVideo.video_url} download>
                  <Download className="w-3.5 h-3.5" />Download Video
                </a>
              </Button>
            )}

            {/* Manifest link */}
            {finalVideo.render_manifest_url && (
              <a
                href={finalVideo.render_manifest_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 font-mono"
              >
                <FileJson className="w-3.5 h-3.5" />View Render Manifest
              </a>
            )}

            {/* Status explanations */}
            {finalVideo.render_status === 'Preview Ready' && !finalVideo.downloadable && (
              <div
                className="flex items-start gap-2 rounded-lg px-3 py-2"
                style={{ background: 'rgba(59,126,255,0.07)', border: '1px solid rgba(59,126,255,0.15)' }}
              >
                <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-300">
                  Render Manifest exported. Use <strong className="text-foreground">Render Browser Video</strong> to produce a playable WebM draft.
                  MP4 export requires a server renderer.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Full video assembled modal */}
      <AlertDialog open={showFullPreview} onOpenChange={setShowFullPreview}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Render Manifest Exported
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <span className="block">
                  Your render manifest has been built from {activeSegs.length} segment{activeSegs.length !== 1 ? 's' : ''}{' '}
                  covering {formatTime(coveredDuration)}.
                </span>
                <span className="block font-semibold text-foreground">
                  The Render Manifest is production data — it contains segment order, images, effects, captions, and timing.
                </span>
                <span className="block text-muted-foreground">
                  To produce a real playable video, use <strong className="text-foreground">Render Browser Video</strong> (WebM draft, free, no credits) or connect a server renderer for MP4.
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap gap-2">
            <Button variant="secondary" onClick={handleExportManifest} className="gap-2">
              <FileJson className="w-3.5 h-3.5" />Download Render Manifest
            </Button>
            <AlertDialogAction onClick={() => setShowFullPreview(false)}>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stitch / manifest export confirmation */}
      <AlertDialog open={showStitchConfirm} onOpenChange={setShowStitchConfirm}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileJson className="w-5 h-5" />
              Export Render Manifest?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <span className="block">
                  This will assemble all {activeSegs.length} segment{activeSegs.length !== 1 ? 's' : ''} into a Render Manifest JSON file
                  and save it to storage.{' '}
                  <span className="font-semibold text-foreground">No external APIs will be called.</span>
                </span>
                <span className="block">
                  The manifest is production data. To produce a real playable video from these segments,
                  use <strong className="text-foreground">Render Browser Video</strong> after exporting.
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowStitchConfirm(false); handleStitch(); }}
            >
              Export Render Manifest
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Segment preview modal */}
      <SegmentPreviewModal seg={previewSeg} onClose={() => setPreviewSeg(null)} />
    </div>
  );
}
