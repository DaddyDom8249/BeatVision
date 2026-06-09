import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

interface Step {
  label: string;
  done: boolean;
}

interface Props {
  worldApproved: boolean;
  storyboardApproved: boolean;
  charactersApproved: boolean;
  styleBibleApproved: boolean;
  characterSheetApproved: boolean;
  environmentSheetApproved: boolean;
  scenePromptsApproved: boolean;
  generating: boolean;
}

export default function WorldGenerationStatusTracker({
  worldApproved,
  storyboardApproved,
  charactersApproved,
  styleBibleApproved,
  characterSheetApproved,
  environmentSheetApproved,
  scenePromptsApproved,
  generating,
}: Props) {
  const steps: Step[] = [
    { label: 'World Approved', done: worldApproved },
    { label: 'Storyboard Approved', done: storyboardApproved },
    { label: 'Characters Approved', done: charactersApproved },
    { label: 'Style Bible Approved', done: styleBibleApproved },
    { label: 'Character Sheet Approved', done: characterSheetApproved },
    { label: 'Environment Sheet Approved', done: environmentSheetApproved },
    { label: 'Scene Prompts Approved', done: scenePromptsApproved },
    {
      label: 'Ready for Image Generation',
      done: styleBibleApproved && characterSheetApproved && environmentSheetApproved && scenePromptsApproved,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const progressPct = Math.round((completedCount / steps.length) * 100);
  const isReadyForImage = steps[steps.length - 1].done;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/50 font-medium uppercase tracking-wider">Production Progress</span>
          <span className="text-xs font-bold" style={{ color: isReadyForImage ? '#10b981' : '#3b7eff' }}>
            {progressPct}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progressPct}%`,
              background: isReadyForImage
                ? 'linear-gradient(90deg, #10b981, #3b7eff)'
                : 'linear-gradient(90deg, #3b7eff, #8b5cf6)',
            }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 gap-2">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const isActive = !step.done && (i === 0 || steps[i - 1].done);
          return (
            <div
              key={step.label}
              className="flex items-center gap-3 p-2.5 rounded-lg transition-colors"
              style={{
                background: step.done
                  ? isLast ? 'rgba(16,185,129,0.1)' : 'rgba(59,126,255,0.07)'
                  : isActive ? 'rgba(255,255,255,0.04)'
                  : 'transparent',
              }}
            >
              {step.done ? (
                <CheckCircle2
                  className="h-4 w-4 shrink-0"
                  style={{ color: isLast ? '#10b981' : '#3b7eff' }}
                />
              ) : isActive && generating ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: '#f59e0b' }} />
              ) : (
                <Circle
                  className="h-4 w-4 shrink-0"
                  style={{ color: isActive ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)' }}
                />
              )}
              <span
                className="text-sm font-medium"
                style={{
                  color: step.done
                    ? isLast ? '#10b981' : 'rgba(255,255,255,0.9)'
                    : isActive ? 'rgba(255,255,255,0.65)'
                    : 'rgba(255,255,255,0.3)',
                }}
              >
                {step.label}
              </span>
              {isLast && step.done && (
                <span
                  className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: 'rgba(16,185,129,0.2)', color: '#10b981' }}
                >
                  READY
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
