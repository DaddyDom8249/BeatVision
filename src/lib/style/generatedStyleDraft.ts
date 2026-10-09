export type StyleDraftKind = "character" | "environment";

export const STYLE_DRAFT_FIELDS: Record<StyleDraftKind, readonly string[]> = {
  character: ["identity", "appearance", "wardrobe", "behavior", "continuity"],
  environment: ["purpose", "layout", "architecture", "surfaces", "lighting", "atmosphere", "continuity"],
};

/**
 * Apply an AI proposal to an editor without overwriting creator-authored text.
 * Unknown response keys are intentionally discarded.
 */
export function mergeGeneratedStyleDraft<T extends Record<string, string>>(
  current: T,
  generated: Record<string, unknown>,
  kind: StyleDraftKind,
): T {
  const result: Record<string, string> = { ...current };
  for (const field of STYLE_DRAFT_FIELDS[kind]) {
    if (result[field]?.trim()) continue;
    const value = generated[field];
    if (typeof value === "string" && value.trim()) result[field] = value.trim();
  }
  return result as T;
}

export function pickGeneratedStyleDraft(
  generated: Record<string, unknown>,
  kind: StyleDraftKind,
): Record<string, string> {
  return Object.fromEntries(STYLE_DRAFT_FIELDS[kind].map((field) => {
    const value = generated[field];
    return [field, typeof value === "string" ? value.trim() : ""];
  }));
}
