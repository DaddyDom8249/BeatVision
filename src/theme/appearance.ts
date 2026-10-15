export type BeatVisionTheme = "classic" | "arcane";

export interface AppearancePreferences {
  theme: BeatVisionTheme;
  reducedMotion: boolean;
}

export const APPEARANCE_STORAGE_KEY = "beatvision.appearance.v1";
export const DEFAULT_APPEARANCE: AppearancePreferences = Object.freeze({
  theme: "classic",
  reducedMotion: false,
});

export function parseAppearance(value: unknown): AppearancePreferences | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (input.theme !== "classic" && input.theme !== "arcane") return null;
  return {
    theme: input.theme,
    reducedMotion: input.reducedMotion === true,
  };
}

export function readLocalAppearance(): AppearancePreferences {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    return parseAppearance(JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) || "null"))
      ?? DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function writeLocalAppearance(preferences: AppearancePreferences): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function appearanceFromMetadata(metadata: unknown): AppearancePreferences | null {
  if (!metadata || typeof metadata !== "object") return null;
  return parseAppearance((metadata as Record<string, unknown>).beatvision_appearance);
}

export function applyAppearance(preferences: AppearancePreferences): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.beatvisionTheme = preferences.theme;
  document.documentElement.dataset.beatvisionReducedMotion = String(preferences.reducedMotion);
}
