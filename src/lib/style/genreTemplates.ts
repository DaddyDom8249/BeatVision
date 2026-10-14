// Start-from-template gallery data (BeatVision feature plan, final phase).
//
// Templates are ORIGINAL, static, text-only presets. They never contain or
// reference images, videos, or other media, and they only pre-fill EDITABLE
// draft text for the Style Bible. Nothing here writes to the database:
// applying a template only changes local form state that the creator must
// review and save explicitly.

export type GenreTemplateId = "hip-hop" | "pop" | "rock" | "edm" | "rnb" | "country" | "lo-fi";

export interface GenreTemplate {
  id: GenreTemplateId;
  genre: string;
  tagline: string;
  palette: string[];
  mood: string[];
  camera: string[];
  lighting: string[];
  editing: string[];
  continuity: string[];
}

export const GENRE_TEMPLATES: readonly GenreTemplate[] = [
  {
    id: "hip-hop", genre: "Hip-Hop", tagline: "Street-level confidence, bold framing, rhythmic cuts.",
    palette: ["Deep asphalt black", "Sodium-vapor amber", "Saturated accent red"],
    mood: ["Confident", "Grounded", "Defiant"],
    camera: ["Low-angle hero framing on the performer", "Wide-lens close-ups near the lens", "Handheld follow shots through real locations"],
    lighting: ["Hard practical street light with deep shadows", "Night exteriors with mixed color temperature"],
    editing: ["Cut on the snare; hold on punchlines"],
    continuity: ["Keep the performer's signature wardrobe consistent across scenes", "Recurring location anchors the neighborhood identity"],
  },
  {
    id: "pop", genre: "Pop", tagline: "Bright, polished, choreographed and camera-aware.",
    palette: ["Candy pastel pink", "Clean studio white", "Electric cyan accent"],
    mood: ["Euphoric", "Playful", "Romantic"],
    camera: ["Symmetrical centered compositions", "Smooth dolly and gimbal moves", "Direct-to-lens performance moments"],
    lighting: ["Soft high-key key light with glossy highlights", "Colored backlight separation"],
    editing: ["Match cuts between looks on the downbeat"],
    continuity: ["Each look keeps its own consistent color world", "Choreography beats repeat in every chorus"],
  },
  {
    id: "rock", genre: "Rock", tagline: "Raw energy, grain, and live-performance grit.",
    palette: ["Smoky charcoal", "Tungsten orange", "Bruised denim blue"],
    mood: ["Rebellious", "Cathartic", "Urgent"],
    camera: ["Aggressive handheld in the crowd and on stage", "Tight inserts on hands, strings, and drums", "Occasional whip pans between band members"],
    lighting: ["Stage backlight with haze and lens flare", "Strobes on climactic sections"],
    editing: ["Jump cuts on the kick; longer takes in verses"],
    continuity: ["Band positions on stage stay consistent", "Instruments and gear match across performance shots"],
  },
  {
    id: "edm", genre: "EDM", tagline: "Pulse-driven light, motion, and build-and-drop structure.",
    palette: ["Ultraviolet purple", "Laser green", "Void black"],
    mood: ["Hypnotic", "Ecstatic", "Futuristic"],
    camera: ["Slow push-ins during builds", "Rapid motion on drops", "Overhead wides of crowds or patterns"],
    lighting: ["Laser and LED patterns synced to tempo", "Silhouettes against bright backlight"],
    editing: ["Tension builds with longer holds, release with rapid cuts on the drop"],
    continuity: ["Light color shifts track song sections", "Recurring geometric motif across scenes"],
  },
  {
    id: "rnb", genre: "R&B", tagline: "Intimate, warm, slow and sensual.",
    palette: ["Warm bronze", "Velvet burgundy", "Soft candle gold"],
    mood: ["Intimate", "Smooth", "Longing"],
    camera: ["Slow glides and gentle orbits", "Shallow depth of field close-ups", "Lingering two-shots"],
    lighting: ["Low-key warm lighting with soft falloff", "Window light and practical lamps"],
    editing: ["Long takes with dissolves on emotional turns"],
    continuity: ["Skin tones stay warm and natural across scenes", "Keep the interior setting and props consistent"],
  },
  {
    id: "country", genre: "Country", tagline: "Open landscapes, storytelling, golden hour.",
    palette: ["Golden-hour wheat", "Weathered barn red", "Faded denim"],
    mood: ["Nostalgic", "Heartfelt", "Hopeful"],
    camera: ["Wide landscape establishing shots", "Steady tracking from vehicles", "Natural eye-level storytelling coverage"],
    lighting: ["Golden hour and blue hour natural light", "Firelight or porch-light at night"],
    editing: ["Story-driven pacing that follows the lyric narrative"],
    continuity: ["Time of day progresses with the story", "Vehicles, props, and wardrobe stay period-consistent"],
  },
  {
    id: "lo-fi", genre: "Lo-Fi", tagline: "Cozy, textured, slow-living loops.",
    palette: ["Muted dusk lavender", "Paper beige", "Faded teal"],
    mood: ["Calm", "Reflective", "Cozy"],
    camera: ["Locked-off static frames", "Slow lateral slides", "Small-scale details and loops"],
    lighting: ["Soft desk-lamp and window light", "Rainy-day diffused daylight"],
    editing: ["Loop-friendly cuts; few transitions"],
    continuity: ["Single cozy room or view revisited across scenes", "Keep the same time-of-day light mood"],
  },
];

export function getGenreTemplate(id: string): GenreTemplate | undefined {
  return GENRE_TEMPLATES.find((template) => template.id === id);
}

/** Text-only visual rules derived from a template. */
export function templateVisualRules(template: GenreTemplate): string[] {
  return [
    `Genre template: ${template.genre} (starting point; edit freely)`,
    `Palette: ${template.palette.join(", ")}`,
    `Mood: ${template.mood.join(", ")}`,
    ...template.camera.map((line) => `Camera: ${line}`),
    ...template.lighting.map((line) => `Lighting: ${line}`),
    ...template.editing.map((line) => `Editing: ${line}`),
  ];
}

export function templateContinuityRules(template: GenreTemplate): string[] {
  return [...template.continuity];
}

/** Editable Style Bible text fields that a template may pre-fill. */
export interface StyleTemplateDraft {
  visualRules: string;
  continuityRules: string;
  /** Present for completeness; templates NEVER touch reference assets. */
  referenceAssets: string;
}

export type TemplateField = "visualRules" | "continuityRules";

export interface TemplateApplyResult {
  status: "applied" | "refused";
  reason?: string;
  draft: StyleTemplateDraft;
  applied: TemplateField[];
  skipped: TemplateField[];
}

/**
 * Pre-fill EMPTY editable fields only. Refuses entirely when the Style Bible
 * is approved. Fields that already have creator content are skipped, never
 * overwritten. Reference assets are never modified (no fabricated media).
 */
export function applyGenreTemplate(
  current: StyleTemplateDraft,
  template: GenreTemplate,
  options: { styleBibleStatus: "draft" | "approved" | null | undefined },
): TemplateApplyResult {
  const draft = { ...current };
  if (options.styleBibleStatus === "approved") {
    return {
      status: "refused",
      reason: "The Style Bible is approved and locked. Templates cannot change approved work.",
      draft, applied: [], skipped: ["visualRules", "continuityRules"],
    };
  }
  const applied: TemplateField[] = [];
  const skipped: TemplateField[] = [];
  const fill = (field: TemplateField, lines: string[]) => {
    if (draft[field].trim()) { skipped.push(field); return; }
    draft[field] = lines.join("\n");
    applied.push(field);
  };
  fill("visualRules", templateVisualRules(template));
  fill("continuityRules", templateContinuityRules(template));
  return { status: "applied", draft, applied, skipped };
}
