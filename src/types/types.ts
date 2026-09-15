export type UserRole = 'user' | 'admin';

export interface Profile {
  id: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  created_at: string;
}

export type ProjectStatus =
  | 'Draft'
  | 'World Revealed'
  | 'World Approved'
  | 'Storyboard Approved'
  | 'Characters Approved'
  | 'Generating World Assets'
  | 'World Assets Approved'
  | 'Generating Scene Images'
  | 'Scene Images In Review'
  | 'Scene Images Approved'
  | 'Ready for Motion'
  | 'Ready for Image Generation'
  | 'Ready for Video Generation'
  | 'Generating Motion'
  | 'Motion In Review'
  | 'Motion Approved'
  | 'Motion Settings Ready'
  | 'Motion Plan Ready'
  | 'Motion Clips In Review'
  | 'Motion Clips Approved'
  | 'Preview Render Ready'
  | 'Final Video Rendered'
  | 'Preview Ready'
  | 'Export Ready'
  | 'Ready for Generation'
  | 'Final Render Ready'
  | 'Render Failed';

export interface Project {
  id: string;
  owner_id: string;
  title: string;
  artist?: string | null;
  song_file: string | null;
  song_file_name: string | null;
  lyrics: string | null;
  selected_style: string;
  optional_notes: string | null;
  status: ProjectStatus;
  world_approved: boolean;
  storyboard_approved: boolean;
  characters_approved: boolean;
  style_bible_approved: boolean;
  character_sheet_approved: boolean;
  environment_sheet_approved: boolean;
  scene_prompts_approved: boolean;
  images_approved: boolean;
  motion_approved: boolean;
  image_consistency_character: boolean;
  image_consistency_environment: boolean;
  image_consistency_style: boolean;
  image_consistency_storyboard: boolean;
  image_allow_variation: boolean;
  song_duration: number | null;
  created_at: string;
  updated_at: string;
}

export interface VisualWorldReport {
  id: string;
  project_id: string;
  song_summary: string | null;
  emotional_core: string | null;
  main_visual_world: string | null;
  color_palette: string | null;
  lighting_style: string | null;
  main_characters: string | null;
  symbolic_objects: string | null;
  key_locations: string | null;
  story_direction: string | null;
  creative_match_score: number;
  approved: boolean;
  needs_review: boolean;
  updated_after_approval: boolean;
  last_approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoryboardScene {
  id: string;
  project_id: string;
  scene_number: number;
  timestamp_range: string | null;
  scene_title: string | null;
  visual_description: string | null;
  camera_direction: string | null;
  mood: string | null;
  location: string | null;
  lyric_moment: string | null;
  transition_style: string | null;
  approved: boolean;
  needs_review: boolean;
  updated_after_approval: boolean;
  last_approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterEnvironment {
  id: string;
  project_id: string;
  main_character: string | null;
  supporting_character: string | null;
  main_environment: string | null;
  visual_atmosphere: string | null;
  wardrobe_style: string | null;
  world_rules: string | null;
  approved: boolean;
  needs_review: boolean;
  updated_after_approval: boolean;
  last_approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorldStyleBible {
  id: string;
  project_id: string;
  overall_visual_style: string | null;
  color_rules: string | null;
  lighting_rules: string | null;
  camera_rules: string | null;
  character_consistency_rules: string | null;
  environment_rules: string | null;
  symbolic_motifs: string | null;
  things_to_avoid: string | null;
  approved: boolean;
  needs_review: boolean;
  updated_after_approval: boolean;
  last_approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterSheet {
  id: string;
  project_id: string;
  character_role: string | null;
  appearance: string | null;
  wardrobe: string | null;
  body_language: string | null;
  facial_expression: string | null;
  personality_energy: string | null;
  recurring_visual_traits: string | null;
  consistency_notes: string | null;
  approved: boolean;
  needs_review: boolean;
  updated_after_approval: boolean;
  last_approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnvironmentSheet {
  id: string;
  project_id: string;
  main_world_description: string | null;
  key_locations: string | null;
  weather_atmosphere: string | null;
  textures_materials: string | null;
  background_details: string | null;
  lighting_conditions: string | null;
  recurring_objects: string | null;
  world_consistency_rules: string | null;
  approved: boolean;
  needs_review: boolean;
  updated_after_approval: boolean;
  last_approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SceneVisualPrompt {
  id: string;
  project_id: string;
  storyboard_scene_id: string | null;
  scene_number: number;
  scene_title: string | null;
  timestamp_range: string | null;
  main_image_prompt: string | null;
  camera_framing: string | null;
  lighting_direction: string | null;
  character_placement: string | null;
  mood: string | null;
  environment_details: string | null;
  symbolic_objects: string | null;
  style_consistency_notes: string | null;
  negative_prompt: string | null;
  approved: boolean;
  needs_review: boolean;
  updated_after_approval: boolean;
  last_approved_at: string | null;
  preview_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScenePreview {
  id: string;
  project_id: string;
  scene_visual_prompt_id: string | null;
  preview_title: string | null;
  preview_description: string | null;
  dominant_colors: string | null;
  mood: string | null;
  location: string | null;
  symbolic_object: string | null;
  approved?: boolean;
  created_at?: string;
  updated_at?: string;
}
