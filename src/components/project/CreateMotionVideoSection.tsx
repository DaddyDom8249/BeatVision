import { useState } from 'react';
import { Clapperboard, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import type {
  Project, StoryboardScene, SceneImage, MotionSettings,
  SceneMotionPlan, MotionClip, VideoRenderJob, FinalVideo,
} from '@/types/types';
import MotionReadinessSection from './MotionReadinessSection';
import MotionStyleSettings from './MotionStyleSettings';
import StoryboardMotionTimeline from './StoryboardMotionTimeline';
import MotionClipSection from './MotionClipSection';
import VideoPreviewSection from './VideoPreviewSection';
import FinalVideoRenderSection from './FinalVideoRenderSection';

interface Props {
  project: Project;
  scenes: StoryboardScene[];
  sceneImages: SceneImage[];
  motionSettings: MotionSettings | null;
  motionPlans: SceneMotionPlan[];
  motionClips: MotionClip[];
  renderJob: VideoRenderJob | null;
  finalVideo: FinalVideo | null;
  onProjectUpdate: (p: Partial<Project>) => void;
  onMotionSettingsSaved: (ms: MotionSettings) => void;
  onPlansUpdate: (plans: SceneMotionPlan[]) => void;
  onClipsUpdate: (clips: MotionClip[]) => void;
  onRenderJobUpdate: (job: VideoRenderJob) => void;
  onFinalVideoUpdate: (fv: FinalVideo) => void;
}

interface Subsection {
  id: string;
  title: string;
  badge?: string;
}

const SUBSECTIONS: Subsection[] = [
  { id: 'readiness', title: 'Motion Readiness' },
  { id: 'settings', title: 'Motion Style Settings' },
  { id: 'timeline', title: 'Storyboard Motion Timeline' },
  { id: 'clips', title: 'Motion Clip Generation' },
  { id: 'preview', title: 'Full Music Video Preview' },
  { id: 'render', title: 'Render Final Music Video' },
];

export default function CreateMotionVideoSection({
  project,
  scenes,
  sceneImages,
  motionSettings,
  motionPlans,
  motionClips,
  renderJob,
  finalVideo,
  onProjectUpdate,
  onMotionSettingsSaved,
  onPlansUpdate,
  onClipsUpdate,
  onRenderJobUpdate,
  onFinalVideoUpdate,
}: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    readiness: true,
    settings: !motionSettings,
    timeline: false,
    clips: false,
    preview: false,
    render: false,
  });

  const toggle = (id: string) => setOpen((p) => ({ ...p, [id]: !p[id] }));

  // Unlock gating
  const settingsUnlocked = true;
  const timelineUnlocked = !!motionSettings;
  const clipsUnlocked = motionPlans.length > 0;
  const previewUnlocked = motionClips.some((c) => c.approved || c.generation_status === 'ready_for_review');
  const renderUnlocked = motionClips.some((c) => c.approved || c.generation_status === 'ready_for_review');

  const unlocks: Record<string, boolean> = {
    readiness: true,
    settings: settingsUnlocked,
    timeline: timelineUnlocked,
    clips: clipsUnlocked,
    preview: previewUnlocked,
    render: renderUnlocked,
  };

  return (
    <div className="space-y-2">
      {/* Section header */}
      <div
        className="rounded-2xl px-6 py-5"
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.08) 100%)',
          border: '1px solid rgba(139,92,246,0.20)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.30)' }}
          >
            <Clapperboard className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <p className="text-base font-bold text-foreground/95">Create Motion Video</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              Phase 4 — Motion and Video Rendering
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground/70 leading-relaxed">
          Your approved scenes are ready. BeatVision can now turn your song, storyboard, and scene
          images into a full music video with motion, transitions, captions, and audio sync.
        </p>
      </div>

      {/* Subsections */}
      {SUBSECTIONS.map((sub) => {
        const unlocked = unlocks[sub.id];
        const isOpen = open[sub.id] && unlocked;

        return (
          <div
            key={sub.id}
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.018)',
              border: `1px solid ${unlocked ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)'}`,
              opacity: unlocked ? 1 : 0.5,
            }}
          >
            {/* Subsection header */}
            <button
              onClick={() => unlocked && toggle(sub.id)}
              disabled={!unlocked}
              className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: unlocked ? (isOpen ? '#8b5cf6' : 'rgba(255,255,255,0.20)') : 'rgba(255,255,255,0.10)' }}
              />
              <p className={`text-sm font-semibold ${unlocked ? 'text-foreground/90' : 'text-muted-foreground/40'}`}>
                {sub.title}
              </p>
              {!unlocked && <Lock className="w-3 h-3 text-muted-foreground/30 ml-1" />}
              <div className="ml-auto">
                {unlocked && (isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground/50" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/50" />)}
              </div>
            </button>

            {/* Subsection content */}
            {isOpen && (
              <div className="px-5 pb-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="pt-4">
                  {sub.id === 'readiness' && (
                    <MotionReadinessSection
                      project={project}
                      scenes={scenes}
                      sceneImages={sceneImages}
                      motionSettings={motionSettings}
                      motionClips={motionClips}
                      motionPlans={motionPlans}
                      onProjectUpdate={onProjectUpdate}
                      onClipsUpdate={onClipsUpdate}
                      onPlansUpdate={onPlansUpdate}
                    />
                  )}
                  {sub.id === 'settings' && (
                    <MotionStyleSettings
                      project={project}
                      scenes={scenes}
                      sceneImages={sceneImages}
                      existing={motionSettings}
                      onSaved={(ms) => {
                        onMotionSettingsSaved(ms);
                        setOpen((p) => ({ ...p, settings: false, timeline: true }));
                      }}
                      onPlansRefreshed={onPlansUpdate}
                      onProjectUpdate={onProjectUpdate}
                    />
                  )}
                  {sub.id === 'timeline' && (
                    <StoryboardMotionTimeline
                      projectId={project.id}
                      plans={motionPlans}
                      sceneImages={sceneImages}
                      motionSettings={motionSettings}
                      onPlansUpdate={onPlansUpdate}
                    />
                  )}
                  {sub.id === 'clips' && (
                    <MotionClipSection
                      project={project}
                      plans={motionPlans}
                      sceneImages={sceneImages}
                      motionSettings={motionSettings}
                      clips={motionClips}
                      onClipsUpdate={onClipsUpdate}
                      onProjectUpdate={onProjectUpdate}
                    />
                  )}
                  {sub.id === 'preview' && (
                    <VideoPreviewSection
                      project={project}
                      scenes={scenes}
                      plans={motionPlans}
                      clips={motionClips}
                      sceneImages={sceneImages}
                      motionSettings={motionSettings}
                      renderJob={renderJob}
                      onRenderJobUpdate={onRenderJobUpdate}
                      onProjectUpdate={onProjectUpdate}
                    />
                  )}
                  {sub.id === 'render' && (
                    <FinalVideoRenderSection
                      project={project}
                      scenes={scenes}
                      plans={motionPlans}
                      clips={motionClips}
                      sceneImages={sceneImages}
                      motionSettings={motionSettings}
                      finalVideo={finalVideo}
                      renderJob={renderJob}
                      onFinalVideoUpdate={onFinalVideoUpdate}
                      onRenderJobUpdate={onRenderJobUpdate}
                      onProjectUpdate={onProjectUpdate}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
