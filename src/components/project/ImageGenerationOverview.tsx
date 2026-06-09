import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Project, SceneImage } from '@/types/types';

interface Props {
  project: Project;
  sceneImages: SceneImage[];
  totalPrompts: number;
}

const STEPS = [
  { label: 'World Approved', key: 'world' },
  { label: 'Storyboard Approved', key: 'storyboard' },
  { label: 'Characters Approved', key: 'characters' },
  { label: 'Style Bible Approved', key: 'styleBible' },
  { label: 'Character Sheet Approved', key: 'characterSheet' },
  { label: 'Environment Sheet Approved', key: 'envSheet' },
  { label: 'Scene Prompts Approved', key: 'scenePrompts' },
  { label: 'Scene Images Generated', key: 'imagesGenerated' },
  { label: 'Scene Images Approved', key: 'imagesApproved' },
  { label: 'Ready for Motion', key: 'readyForMotion' },
] as const;

export default function ImageGenerationOverview({ project, sceneImages, totalPrompts }: Props) {
  const generatedCount = sceneImages.filter(si => si.image_url || si.generation_status !== 'pending').length;
  const approvedCount = sceneImages.filter(si => si.approved).length;
  const allGenerated = totalPrompts > 0 && generatedCount >= totalPrompts;
  const allApproved = totalPrompts > 0 && approvedCount >= totalPrompts;

  const isGenerating =
    project.status === 'Generating Scene Images';

  const stepStatus: Record<string, 'done' | 'active' | 'pending'> = {
    world: project.world_approved ? 'done' : 'pending',
    storyboard: project.storyboard_approved ? 'done' : 'pending',
    characters: project.characters_approved ? 'done' : 'pending',
    styleBible: project.style_bible_approved ? 'done' : 'pending',
    characterSheet: project.character_sheet_approved ? 'done' : 'pending',
    envSheet: project.environment_sheet_approved ? 'done' : 'pending',
    scenePrompts: project.scene_prompts_approved ? 'done' : 'pending',
    imagesGenerated: allGenerated ? 'done' : isGenerating ? 'active' : 'pending',
    imagesApproved: allApproved ? 'done' : allGenerated ? 'active' : 'pending',
    readyForMotion: project.images_approved ? 'done' : allApproved ? 'active' : 'pending',
  };

  const doneCount = Object.values(stepStatus).filter(s => s === 'done').length;
  const pct = Math.round((doneCount / STEPS.length) * 100);

  return (
    <div className="bg-[#111] border border-[#222] rounded p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-semibold tracking-widest text-[#3b7eff] uppercase">
          Image Generation Progress
        </h3>
        <span className="font-mono text-xs text-[#555]">{doneCount}/{STEPS.length} steps</span>
      </div>

      {/* Linear bar */}
      <div className="w-full h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#3b7eff] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Steps */}
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {STEPS.map((step, idx) => {
          const status = stepStatus[step.key];
          return (
            <li key={step.key} className="flex items-center gap-3">
              <span className="font-mono text-[10px] text-[#333] w-4 shrink-0">{String(idx + 1).padStart(2, '0')}</span>
              {status === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0" />
              ) : status === 'active' ? (
                <Loader2 className="w-4 h-4 text-[#3b7eff] animate-spin shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-[#333] shrink-0" />
              )}
              <span
                className={`text-sm font-mono ${
                  status === 'done'
                    ? 'text-[#10b981]'
                    : status === 'active'
                    ? 'text-[#3b7eff]'
                    : 'text-[#444]'
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Scene counts */}
      {sceneImages.length > 0 && (
        <div className="flex items-center gap-6 pt-2 border-t border-[#1e1e1e]">
          <div className="text-center">
            <p className="font-mono text-lg font-bold text-foreground">{generatedCount}</p>
            <p className="font-mono text-[10px] text-[#555] uppercase tracking-wider">Generated</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-lg font-bold text-[#10b981]">{approvedCount}</p>
            <p className="font-mono text-[10px] text-[#555] uppercase tracking-wider">Approved</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-lg font-bold text-[#f59e0b]">{generatedCount - approvedCount}</p>
            <p className="font-mono text-[10px] text-[#555] uppercase tracking-wider">In Review</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-lg font-bold text-[#ef4444]">
              {sceneImages.filter(si => si.rejected).length}
            </p>
            <p className="font-mono text-[10px] text-[#555] uppercase tracking-wider">Rejected</p>
          </div>
        </div>
      )}
    </div>
  );
}
