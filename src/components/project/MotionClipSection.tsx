import LegacyMotionClipSection from './MotionClipSectionLegacy';
import CloudflareMotionClipSection from './CloudflareMotionClipSection';
import type { Project, SceneMotionPlan, SceneImage, MotionClip, MotionSettings } from '@/types/types';

interface Props {
  project: Project;
  plans: SceneMotionPlan[];
  sceneImages: SceneImage[];
  motionSettings: MotionSettings | null;
  clips: MotionClip[];
  onClipsUpdate: (clips: MotionClip[]) => void;
  onProjectUpdate: (p: Partial<Project>) => void;
}

const workerConfigured = Boolean((import.meta.env.VITE_BEATVISION_WORKER_URL || '').trim());

export default function MotionClipSection(props: Props) {
  return workerConfigured
    ? <CloudflareMotionClipSection {...props} />
    : <LegacyMotionClipSection {...props} />;
}
