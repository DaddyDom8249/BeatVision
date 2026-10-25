import { getCreativeErrorMessage } from "./formatCreativeText";

const approvalMessages: Record<string, string> = {
  VISUAL_PLAN_REVISION_ALREADY_EXISTS:
    "A revision already exists. Open the newest revision to prepare its shots.",
  VISUAL_PLAN_REVISE_CURRENT_REVISION:
    "Open the newest plan revision before preparing shots.",
  VISUAL_PLAN_TIMELINE_INVALID:
    "Fix scene gaps, overlaps or song coverage before preparing or locking the plan.",
  VISUAL_PLAN_TOO_MANY_SCENES:
    "This plan exceeds the 500-shot limit. Use longer shots within the supported render limit.",
  VISION_LOCK_ENVIRONMENTS_NOT_APPROVED:
    "Approve the remaining environment drafts in Style Bible before building the Visual Plan.",
  VISION_LOCK_CHARACTERS_NOT_APPROVED:
    "Approve the remaining character drafts in Style Bible before building the Visual Plan.",
  VISION_LOCK_STYLE_NOT_APPROVED:
    "Lock the current Style Bible before building the Visual Plan.",
  VISION_LOCK_WORLD_NOT_CONFIRMED:
    "Confirm the current Visual World Report before building the Visual Plan.",
  VISION_LOCK_SONG_NOT_ANALYZED:
    "Complete the song analysis before building the Visual Plan.",
};

export function getVisualPlanErrorMessage(error: unknown, fallback: string): string {
  const message = getCreativeErrorMessage(error, fallback);
  return approvalMessages[message] ?? message;
}
