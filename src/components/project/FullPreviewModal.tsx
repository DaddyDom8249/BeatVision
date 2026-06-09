import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  Project, VisualWorldReport, StoryboardScene, CharacterEnvironment,
  WorldStyleBible, CharacterSheet, EnvironmentSheet, SceneImage, SceneVideo, FinalVideo,
} from '@/types/types';
import {
  X, ChevronLeft, ChevronRight, Play, Pause, RotateCcw,
  Film, ImageIcon, Music2, Sparkles, MapPin, Camera, Zap, Video,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  project: Project;
  worldReport: VisualWorldReport | null;
  scenes: StoryboardScene[];
  charEnv: CharacterEnvironment | null;
  styleBible: WorldStyleBible | null;
  characterSheet: CharacterSheet | null;
  envSheet: EnvironmentSheet | null;
  sceneImages: SceneImage[];
  sceneVideos: SceneVideo[];
  finalVideo?: FinalVideo | null;
  onClose: () => void;
}

type PreviewPhase = 'intro' | 'scene';

const SLIDE_DURATION_MS = 4500;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSceneImage(sceneImages: SceneImage[], scene: StoryboardScene): SceneImage | undefined {
  return sceneImages.find(
    (img) =>
      img.storyboard_scene_id === scene.id ||
      img.scene_number === scene.scene_number
  );
}

function getSceneVideo(sceneVideos: SceneVideo[], scene: StoryboardScene): SceneVideo | undefined {
  const img = sceneVideos.find((v) => v.scene_number === scene.scene_number);
  if (img?.video_url) return img;
  return undefined;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FullPreviewModal({
  project, worldReport, scenes, charEnv, styleBible,
  sceneImages, sceneVideos, finalVideo = null, onClose,
}: Props) {
  const [phase, setPhase] = useState<PreviewPhase>('intro');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const approvedScenes = scenes.filter((s) => s.approved || scenes.length > 0);
  const hasMotion = sceneVideos.some((v) => v.approved && v.video_url);
  const currentScene = approvedScenes[sceneIndex] ?? null;
  const currentImage = currentScene ? getSceneImage(sceneImages, currentScene) : undefined;
  const currentVideo = currentScene ? getSceneVideo(sceneVideos, currentScene) : undefined;

  // ── Auto-play ──────────────────────────────────────────────────────────────

  const stopAutoPlay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPlaying(false);
  }, []);

  const startAutoPlay = useCallback(() => {
    stopAutoPlay();
    setPlaying(true);
    intervalRef.current = setInterval(() => {
      setSceneIndex((prev) => {
        if (prev >= approvedScenes.length - 1) {
          stopAutoPlay();
          return prev;
        }
        return prev + 1;
      });
    }, SLIDE_DURATION_MS);
  }, [approvedScenes.length, stopAutoPlay]);

  const handlePlay = () => {
    if (phase === 'intro') {
      setPhase('scene');
      setSceneIndex(0);
    }
    startAutoPlay();
  };

  const handlePause = () => stopAutoPlay();

  const handleRestart = () => {
    stopAutoPlay();
    setPhase('intro');
    setSceneIndex(0);
  };

  const handleNext = () => {
    stopAutoPlay();
    if (phase === 'intro') {
      setPhase('scene');
      setSceneIndex(0);
    } else if (sceneIndex < approvedScenes.length - 1) {
      setSceneIndex((p) => p + 1);
    }
  };

  const handlePrev = () => {
    stopAutoPlay();
    if (phase === 'scene' && sceneIndex === 0) {
      setPhase('intro');
    } else if (phase === 'scene') {
      setSceneIndex((p) => p - 1);
    }
  };

  // Escape key closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { stopAutoPlay(); onClose(); }
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === ' ') { e.preventDefault(); playing ? handlePause() : handlePlay(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, phase, sceneIndex]);

  useEffect(() => () => stopAutoPlay(), [stopAutoPlay]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: '#080810' }}
    >
      {/* ── Controls bar (top) ─────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 md:px-8 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)' }}
          >
            <Film className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-mono text-muted-foreground/60 truncate">
              BEATVISION · FULL PREVIEW
            </p>
            <p className="text-sm font-bold text-foreground truncate">{project.title}</p>
          </div>
        </div>

        {/* Playback buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ControlBtn onClick={handlePrev} disabled={phase === 'intro'} title="Previous (←)">
            <ChevronLeft className="w-4 h-4" />
          </ControlBtn>
          {playing ? (
            <ControlBtn onClick={handlePause} title="Pause (Space)" accent>
              <Pause className="w-4 h-4" />
            </ControlBtn>
          ) : (
            <ControlBtn onClick={handlePlay} title="Play (Space)" accent>
              <Play className="w-4 h-4" />
            </ControlBtn>
          )}
          <ControlBtn
            onClick={handleNext}
            disabled={phase === 'scene' && sceneIndex >= approvedScenes.length - 1}
            title="Next (→)"
          >
            <ChevronRight className="w-4 h-4" />
          </ControlBtn>
          <ControlBtn onClick={handleRestart} title="Restart">
            <RotateCcw className="w-3.5 h-3.5" />
          </ControlBtn>
          <div className="w-px h-5 bg-border/40 mx-1" />
          <button
            onClick={() => { stopAutoPlay(); onClose(); }}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-white/10 text-muted-foreground hover:text-white"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Scene progress bar ─────────────────────────────────────────── */}
      {phase === 'scene' && approvedScenes.length > 0 && (
        <div className="flex gap-0.5 px-4 md:px-8 py-2 shrink-0">
          {approvedScenes.map((_, i) => (
            <button
              key={i}
              onClick={() => { stopAutoPlay(); setSceneIndex(i); }}
              className="flex-1 h-0.5 rounded-full transition-colors"
              style={{
                background: i === sceneIndex
                  ? 'rgba(139,92,246,0.9)'
                  : i < sceneIndex
                  ? 'rgba(139,92,246,0.35)'
                  : 'rgba(255,255,255,0.12)',
              }}
            />
          ))}
        </div>
      )}

      {/* ── Main content area ──────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {phase === 'intro' ? (
          <IntroSlide
            project={project}
            worldReport={worldReport}
            charEnv={charEnv}
            styleBible={styleBible}
            scenes={approvedScenes}
            hasMotion={hasMotion}
            finalVideo={finalVideo}
            onStart={() => { setPhase('scene'); setSceneIndex(0); }}
          />
        ) : currentScene ? (
          <SceneSlide
            scene={currentScene}
            sceneIndex={sceneIndex}
            totalScenes={approvedScenes.length}
            image={currentImage}
            video={currentVideo}
            videoRef={videoRef}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No scenes available.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ControlBtn({
  onClick, disabled, title, children, accent,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center justify-center w-8 h-8 rounded-lg transition-all disabled:opacity-30"
      style={accent
        ? { background: 'rgba(139,92,246,0.25)', border: '1px solid rgba(139,92,246,0.45)', color: '#c4b5fd' }
        : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgb(163,163,163)' }
      }
    >
      {children}
    </button>
  );
}

// ── Intro slide (project overview) ───────────────────────────────────────────

function IntroSlide({
  project, worldReport, charEnv, styleBible, scenes, hasMotion, finalVideo, onStart,
}: {
  project: Project;
  worldReport: VisualWorldReport | null;
  charEnv: CharacterEnvironment | null;
  styleBible: WorldStyleBible | null;
  scenes: StoryboardScene[];
  hasMotion: boolean;
  finalVideo?: FinalVideo | null;
  onStart: () => void;
}) {
  const previewVideoUrl = finalVideo?.video_url ?? finalVideo?.preview_video_url ?? null;
  const isBrowserRendered = finalVideo?.render_status === 'Browser Rendered';

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 space-y-10">
      {/* Header */}
      <div className="text-center space-y-3">
        <p className="font-mono text-[10px] tracking-[0.3em] text-violet-400/70 uppercase">
          BeatVision · Full Preview
        </p>
        <h1
          className="text-3xl md:text-4xl font-black text-balance"
          style={{ color: '#f0f0ff' }}
        >
          {project.title}
        </h1>
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
          {project.song_file_name && (
            <span className="flex items-center gap-1.5">
              <Music2 className="w-3.5 h-3.5 text-violet-400" />
              {project.song_file_name}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            {project.selected_style}
          </span>
        </div>
        <p
          className="text-sm font-mono italic"
          style={{ color: 'rgba(196,181,253,0.7)' }}
        >
          Every Song Has a World. BeatVision Reveals It.
        </p>
      </div>

      {/* Browser-rendered video preview */}
      {previewVideoUrl && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(139,92,246,0.30)' }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2.5"
            style={{ background: 'rgba(139,92,246,0.10)', borderBottom: '1px solid rgba(139,92,246,0.20)' }}
          >
            <Video className="w-3.5 h-3.5 text-violet-400" />
            <span className="font-mono text-[10px] text-violet-300 uppercase tracking-widest">
              {isBrowserRendered ? 'Browser-Rendered Draft (WebM)' : 'Preview Video'}
            </span>
            {isBrowserRendered && (
              <span
                className="ml-auto font-mono text-[9px] px-2 py-0.5 rounded"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}
              >
                DRAFT — Replace with final MP4 for production
              </span>
            )}
          </div>
          <video
            src={previewVideoUrl}
            controls
            className="w-full"
            style={{ background: '#000', maxHeight: '360px' }}
          />
          <div className="flex items-center justify-end px-4 py-2">
            <a
              href={previewVideoUrl}
              download
              className="font-mono text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
            >
              Download WebM Draft
            </a>
          </div>
        </div>
      )}

      {/* Visual World Summary */}
      {worldReport && (
        <PreviewSection title="Visual World" icon="🌍">
          {worldReport.main_visual_world && (
            <InfoRow label="World" value={worldReport.main_visual_world} />
          )}
          {worldReport.emotional_core && (
            <InfoRow label="Emotional Core" value={worldReport.emotional_core} />
          )}
          {worldReport.color_palette && (
            <InfoRow label="Color Palette" value={worldReport.color_palette} />
          )}
          {worldReport.lighting_style && (
            <InfoRow label="Lighting" value={worldReport.lighting_style} />
          )}
          {worldReport.key_locations && (
            <InfoRow label="Key Locations" value={worldReport.key_locations} />
          )}
        </PreviewSection>
      )}

      {/* Characters & Environment */}
      {charEnv && (
        <PreviewSection title="Characters & Environment" icon="🎭">
          {charEnv.main_character && <InfoRow label="Main Character" value={charEnv.main_character} />}
          {charEnv.supporting_character && <InfoRow label="Supporting" value={charEnv.supporting_character} />}
          {charEnv.main_environment && <InfoRow label="Environment" value={charEnv.main_environment} />}
          {charEnv.visual_atmosphere && <InfoRow label="Atmosphere" value={charEnv.visual_atmosphere} />}
        </PreviewSection>
      )}

      {/* Style Bible Summary */}
      {styleBible && (
        <PreviewSection title="Visual Style Bible" icon="🎨">
          {styleBible.overall_visual_style && <InfoRow label="Style" value={styleBible.overall_visual_style} />}
          {styleBible.color_rules && <InfoRow label="Color Rules" value={styleBible.color_rules} />}
          {styleBible.camera_rules && <InfoRow label="Camera Rules" value={styleBible.camera_rules} />}
          {styleBible.symbolic_motifs && <InfoRow label="Motifs" value={styleBible.symbolic_motifs} />}
        </PreviewSection>
      )}

      {/* Storyboard Timeline */}
      {scenes.length > 0 && (
        <PreviewSection title={`Storyboard · ${scenes.length} Scenes`} icon="🎬">
          <div className="space-y-2">
            {scenes.map((s) => (
              <div
                key={s.id}
                className="flex items-start gap-3 py-2 px-3 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <span className="font-mono text-xs text-muted-foreground/60 shrink-0 pt-0.5 w-8">
                  {String(s.scene_number).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground/90 truncate">
                    {s.scene_title ?? `Scene ${s.scene_number}`}
                  </p>
                  {s.timestamp_range && (
                    <p className="text-[11px] text-muted-foreground/50">{s.timestamp_range}</p>
                  )}
                </div>
                {s.mood && (
                  <span
                    className="ml-auto shrink-0 text-[10px] px-2 py-0.5 rounded-full font-mono"
                    style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}
                  >
                    {s.mood}
                  </span>
                )}
              </div>
            ))}
          </div>
        </PreviewSection>
      )}

      {/* Capabilities badge row */}
      <div className="flex flex-wrap gap-2 justify-center pt-2">
        {scenes.length > 0 && <CapBadge label={`${scenes.length} scenes`} color="violet" />}
        {scenes.length > 0 && <CapBadge label="Scene images" color="blue" />}
        {hasMotion && <CapBadge label="Motion clips" color="emerald" />}
      </div>

      {/* CTA */}
      <div className="text-center pt-2">
        <button
          onClick={onStart}
          className="px-8 py-3 rounded-xl text-sm font-bold transition-all"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(59,130,246,0.25) 100%)',
            border: '1px solid rgba(139,92,246,0.45)',
            color: '#c4b5fd',
          }}
        >
          Preview Storyboard Slideshow →
        </button>
        <p className="text-[11px] text-muted-foreground/40 mt-2">
          Use ← → arrow keys or the controls above to navigate
        </p>
      </div>
    </div>
  );
}

// ── Scene slide ────────────────────────────────────────────────────────────────

function SceneSlide({
  scene, sceneIndex, totalScenes, image, video, videoRef,
}: {
  scene: StoryboardScene;
  sceneIndex: number;
  totalScenes: number;
  image: SceneImage | undefined;
  video: SceneVideo | undefined;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 space-y-6">
      {/* Scene header */}
      <div className="flex items-start gap-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-mono text-sm font-bold"
          style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.35)', color: '#c4b5fd' }}
        >
          {String(scene.scene_number).padStart(2, '0')}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-widest">
            Scene {sceneIndex + 1} of {totalScenes}
            {scene.timestamp_range && ` · ${scene.timestamp_range}`}
          </p>
          <h2 className="text-xl md:text-2xl font-black text-foreground mt-0.5 text-balance">
            {scene.scene_title ?? `Scene ${scene.scene_number}`}
          </h2>
        </div>
      </div>

      {/* Video or Image */}
      {video?.video_url ? (
        <div
          className="w-full rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(139,92,246,0.25)', background: '#000' }}
        >
          <video
            ref={videoRef}
            src={video.video_url}
            controls
            autoPlay
            loop
            playsInline
            className="w-full max-h-[460px] object-contain"
          />
          <div className="flex items-center gap-2 px-4 py-2">
            <Film className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-emerald-400 font-mono">Motion Clip</span>
            {video.duration && (
              <span className="text-xs text-muted-foreground/50 ml-auto">{video.duration}s</span>
            )}
          </div>
        </div>
      ) : image?.image_url ? (
        <div
          className="w-full rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(59,130,246,0.20)', background: '#000' }}
        >
          <img
            src={image.image_url}
            alt={scene.scene_title ?? `Scene ${scene.scene_number}`}
            className="w-full max-h-[460px] object-contain"
          />
          <div className="flex items-center gap-2 px-4 py-2">
            <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-blue-400 font-mono">Scene Image</span>
          </div>
        </div>
      ) : (
        <div
          className="w-full aspect-video rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.08) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="text-center space-y-2">
            <Film className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-xs text-muted-foreground/40 font-mono">Scene image not yet generated</p>
          </div>
        </div>
      )}

      {/* Scene metadata grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {scene.visual_description && (
          <SceneMeta icon={<Sparkles className="w-3.5 h-3.5" />} label="Visual Description" value={scene.visual_description} full />
        )}
        {scene.lyric_moment && (
          <SceneMeta icon={<Music2 className="w-3.5 h-3.5" />} label="Lyric Moment" value={scene.lyric_moment} full />
        )}
        {scene.camera_direction && (
          <SceneMeta icon={<Camera className="w-3.5 h-3.5" />} label="Camera Direction" value={scene.camera_direction} />
        )}
        {scene.mood && (
          <SceneMeta icon={<Zap className="w-3.5 h-3.5" />} label="Mood" value={scene.mood} />
        )}
        {scene.location && (
          <SceneMeta icon={<MapPin className="w-3.5 h-3.5" />} label="Location" value={scene.location} />
        )}
        {scene.transition_style && (
          <SceneMeta icon={<Film className="w-3.5 h-3.5" />} label="Transition" value={scene.transition_style} />
        )}
      </div>
    </div>
  );
}

// ── Utility sub-components ────────────────────────────────────────────────────

function PreviewSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{icon}</span>
        <h3
          className="text-sm font-bold font-mono uppercase tracking-wider"
          style={{ color: 'rgba(196,181,253,0.8)' }}
        >
          {title}
        </h3>
        <div className="flex-1 h-px" style={{ background: 'rgba(139,92,246,0.15)' }} />
      </div>
      <div
        className="rounded-xl p-4 space-y-2"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 items-start">
      <span className="text-[11px] font-mono text-muted-foreground/50 uppercase tracking-wide pt-0.5 shrink-0">
        {label}
      </span>
      <span className="text-sm text-foreground/85 leading-relaxed">{value}</span>
    </div>
  );
}

function SceneMeta({
  icon, label, value, full,
}: { icon: React.ReactNode; label: string; value: string; full?: boolean }) {
  return (
    <div
      className={`rounded-xl p-3 ${full ? 'col-span-full' : ''}`}
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground/50">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-sm text-foreground/85 leading-relaxed">{value}</p>
    </div>
  );
}

function CapBadge({ label, color }: { label: string; color: 'violet' | 'blue' | 'emerald' }) {
  const styles = {
    violet: { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa' },
    blue: { background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', color: '#93c5fd' },
    emerald: { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#6ee7b7' },
  };
  return (
    <span className="px-3 py-1 rounded-full text-xs font-mono" style={styles[color]}>
      {label}
    </span>
  );
}
