import { z } from 'zod';

export const GENERATION_ACTIONS = [
  'generate_world_report',
  'generate_storyboard',
  'generate_characters',
  'generate_style_bible',
  'generate_character_sheet',
  'generate_environment_sheet',
  'generate_scene_prompts',
  'generate_scene_previews',
  'generate_scene_image_prompt',
  'generate_all_scene_image_prompts',
  'refresh_scene',
] as const;

export const GenerationActionSchema = z.enum(GENERATION_ACTIONS);
export type GenerationAction = z.infer<typeof GenerationActionSchema>;

export const GenerationRequestSchema = z.object({
  action: GenerationActionSchema,
  projectId: z.string().uuid(),
  requestKey: z.string().min(8).max(200),
  projectTitle: z.string().trim().min(1).max(200),
  lyrics: z.string().max(200_000).default(''),
  style: z.string().trim().min(1).max(100),
  notes: z.string().max(20_000).default(''),
  seed: z.number().int().min(0).max(2_147_483_647).default(1),
  songDurationSeconds: z.number().finite().min(0).max(86_400).optional(),
  worldReport: z.record(z.unknown()).optional(),
  charEnv: z.record(z.unknown()).optional(),
  styleBible: z.record(z.unknown()).optional(),
  characterSheet: z.record(z.unknown()).optional(),
  environmentSheet: z.record(z.unknown()).optional(),
  scenes: z.array(z.record(z.unknown())).max(500).optional(),
  existingScene: z.record(z.unknown()).optional(),
});

export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;

export const WorldReportSchema = z.object({
  song_summary: z.string().min(1),
  emotional_core: z.string().min(1),
  main_visual_world: z.string().min(1),
  color_palette: z.string().min(1),
  lighting_style: z.string().min(1),
  main_characters: z.string().min(1),
  symbolic_objects: z.string().min(1),
  key_locations: z.string().min(1),
  story_direction: z.string().min(1),
  creative_match_score: z.number().int().min(0).max(100),
});

export const StoryboardBeatSchema = z.object({
  beatId: z.string().min(1),
  scene_number: z.number().int().positive(),
  startTime: z.number().finite().min(0),
  endTime: z.number().finite().min(0),
  duration_seconds: z.number().finite().positive(),
  sectionId: z.string().nullable().optional(),
  lyricRange: z.string().nullable().optional(),
  lyricMeaning: z.string().nullable().optional(),
  narrativePurpose: z.string().nullable().optional(),
  emotionalState: z.string().nullable().optional(),
  emotionalIntensity: z.number().finite().optional().nullable(),
  characterState: z.string().nullable().optional(),
  environment: z.string().nullable().optional(),
  action: z.string().nullable().optional(),
  visualConcept: z.string().nullable().optional(),
  symbolicElements: z.array(z.string()).default([]),
  cameraIntent: z.string().default(''),
  transitionIntent: z.string().default(''),
  worldConstraints: z.array(z.string()).default([]),
  previousBeat: z.string().nullable().optional(),
  nextBeat: z.string().nullable().optional(),
  visualContinuityRequirements: z.array(z.string()).default([]),
  reusePolicy: z.string().default('new_visual_event'),
  description: z.string().min(1),
});

export const StoryboardResponseSchema = z.object({
  sections: z.array(z.record(z.unknown())).default([]),
  visual_beats: z.array(StoryboardBeatSchema).min(1),
  coverage_notes: z.string().optional(),
});

export function validateStoryboard(beats: z.infer<typeof StoryboardBeatSchema>[], durationSeconds?: number) {
  if (!beats.length) throw new Error('Storyboard provider returned no visual beats.');

  let previousEnd = 0;
  for (const beat of beats) {
    if (beat.endTime <= beat.startTime) throw new Error(`Storyboard beat ${beat.beatId} has invalid timing.`);
    if (Math.abs(beat.duration_seconds - (beat.endTime - beat.startTime)) > 0.25) {
      throw new Error(`Storyboard beat ${beat.beatId} duration does not match its timestamps.`);
    }
    if (beat.startTime < previousEnd - 0.25) throw new Error(`Storyboard beat ${beat.beatId} overlaps the previous beat.`);
    previousEnd = beat.endTime;
  }

  if (durationSeconds && durationSeconds > 0) {
    if (beats[0].startTime > 0.5) throw new Error('Storyboard does not begin at the start of the song.');
    if (previousEnd < durationSeconds - 0.5) throw new Error('Storyboard does not cover the full song duration.');
    if (beats.some((beat) => beat.endTime > durationSeconds + 0.5)) {
      throw new Error('Storyboard contains a beat outside the song duration.');
    }
  }
}
