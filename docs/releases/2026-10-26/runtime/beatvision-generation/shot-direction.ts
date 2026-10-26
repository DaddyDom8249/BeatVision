// Shared deterministic direction compiler. No model call, invented scene detail,
// secrets or provider access. Both review UI and dispatch use this exact code.
export class MotionDirectionError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export function buildModalShotPrompt(scene: Record<string, unknown>): string {
  function parsed(value: unknown, depth = 0): any {
    if (depth > 4) throw new MotionDirectionError("MODAL_SHOT_DIRECTION_INVALID");
    if (typeof value !== "string") return value;
    const text = value.trim();
    if (!/^[\[{\"]/.test(text)) return text;
    try { return parsed(JSON.parse(text), depth + 1); } catch (error) {
      if (error instanceof MotionDirectionError) throw error;
      // Actual frozen rows contain JSON object text with escaped quotes.
      // Decode only as JSON; never strip punctuation from arbitrary prose.
      try { return parsed(JSON.parse(text.replace(/\\"/g, '"')), depth + 1); }
      catch { throw new MotionDirectionError("MODAL_SHOT_DIRECTION_INVALID"); }
    }
  }
  function single(value: unknown, limit: number): string {
    value = parsed(value);
    if (Array.isArray(value)) {
      if (value.length !== 1) throw new MotionDirectionError("MODAL_SHOT_DIRECTION_AMBIGUOUS");
      return single(value[0], limit);
    }
    if (typeof value !== "string") throw new MotionDirectionError("MODAL_SHOT_DIRECTION_INVALID");
    // Global 'occasional' variations are not instructions for every short shot.
    // Retain the primary approved movement; never add walking or a head turn.
    const text = value.replace(/,\s*occasional(?:ly)?\b.*$/i, "").replace(/\s+/g, " ").trim();
    if (!text) throw new MotionDirectionError("MODAL_SHOT_DIRECTION_REQUIRED");
    if (text.length > limit) throw new MotionDirectionError("MODAL_SHOT_DIRECTION_TOO_LONG");
    if (text.split(/[.;]/).some(clause => /\b(?:or|alternatively|then)\b/i.test(clause) &&
        !/\b(?:do not|don't|avoid|without)\b[^.;]*\bor\b/i.test(clause)))
      throw new MotionDirectionError("MODAL_SHOT_DIRECTION_AMBIGUOUS");
    return text;
  }
  const movement = parsed(scene.movement_direction);
  if (!movement) throw new MotionDirectionError("MODAL_SHOT_DIRECTION_REQUIRED");
  const structured = typeof movement === "object" && !Array.isArray(movement);
  const actor = single(structured ? movement.actor ?? movement.action : movement, 200);
  if (/^(?:slow|subtle|gentle|minimal|subtle gestures(?:, restrained)?|minimal movement|move (?:slowly|naturally)|restrained(?: movement)?)[.!]?$/i.test(actor))
    throw new MotionDirectionError("MODAL_SHOT_DIRECTION_TOO_GENERIC");
  let cameraValue = structured ? movement.camera : undefined;
  if (!cameraValue && scene.camera_direction) {
    const camera = parsed(scene.camera_direction);
    cameraValue = camera && typeof camera === "object" && !Array.isArray(camera)
      ? camera.camera_movement : camera;
  }
  const camera = cameraValue ? single(cameraValue, 140) : "";
  const sentence = (text: string) => /[.!?]$/.test(text) ? text : text + ".";
  return "Action: " + sentence(actor) + (camera ? " Camera: " + sentence(camera) : "") +
    " Preserve the approved characters, faces, wardrobe and setting.";
}
export function inspectMotionDirection(scene: Record<string, unknown>): {prompt: string; issue: string} {
  try { return {prompt: buildModalShotPrompt(scene), issue: ""}; }
  catch (error) {
    const code = error instanceof MotionDirectionError ? error.code : "MODAL_SHOT_DIRECTION_INVALID";
    const messages: Record<string,string> = {
      MODAL_SHOT_DIRECTION_TOO_GENERIC: "Name one observable action for this shot. General mood or subtle movement is not enough.",
      MODAL_SHOT_DIRECTION_AMBIGUOUS: "Choose one action and one camera direction; remove alternative choices or action sequences.",
      MODAL_SHOT_DIRECTION_TOO_LONG: "Shorten this shot direction without cutting off its meaning (action 200 characters; camera 140).",
      MODAL_SHOT_DIRECTION_REQUIRED: "Add the intended action before rendering this shot.",
      MODAL_SHOT_DIRECTION_INVALID: "Use plain action text or valid actor/camera JSON; the platform will not guess missing directions.",
    };
    return {prompt: "", issue: messages[code] || messages.MODAL_SHOT_DIRECTION_INVALID};
  }
}
