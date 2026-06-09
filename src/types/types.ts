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
  | 'Ready for Generation'   // legacy DB value
  | 'Final Render Ready'
  | 'Render Failed';


export interface Project {
  id: string;
  owner_id: string;
  title: string;
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
  camera_direction: string | null;
  placeholder_visual: string | null;
  image_url: string | null;
  approved: boolean;
  created_at: string;
  updated_at: string;
}

export type ImageGenerationStatus =
  | 'pending'
  | 'generating'
  | 'generated'
  | 'failed'
  | 'approved'
  | 'rejected'
  | 'manual_upload'
  | 'placeholder_preview'
  | 'provider_disabled'
  | 'ready_for_upload';

export type BatchStatus = 'pending' | 'generating' | 'completed' | 'failed' | 'partial';

export interface SceneImage {
  id: string;
  project_id: string;
  storyboard_scene_id: string | null;
  scene_visual_prompt_id: string | null;
  scene_number: number;
  scene_title: string | null;
  timestamp_range: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  prompt_used: string | null;
  prompt_summary: string | null;
  mood: string | null;
  camera_framing: string | null;
  location: string | null;
  character_presence: string | null;
  lighting_direction: string | null;
  style_consistency_summary: string | null;
  generation_status: ImageGenerationStatus;
  // Phase 3+ image source type
  real_generated: boolean;
  manual_upload: boolean;
  placeholder: boolean;
  use_placeholder_as_draft_final: boolean;
  provider_name: string | null;
  provider_request: Record<string, unknown> | null;
  provider_response: Record<string, unknown> | null;
  approved: boolean;
  rejected: boolean;
  pending: boolean;
  failed: boolean;
  needs_review: boolean;
  updated_after_approval: boolean;
  last_approved_at: string | null;
  active_version: number | null;
  // Placeholder visual fields (used when no image API is connected)
  placeholder_description: string | null;
  placeholder_gradient_start: string | null;
  placeholder_gradient_end: string | null;
  placeholder_accent: string | null;
  placeholder_label_1: string | null;
  placeholder_label_2: string | null;
  created_at: string;
  updated_at: string;
}

export interface SceneImageVersion {
  id: string;
  scene_image_id: string;
  version_number: number;
  image_url: string | null;
  prompt_used: string | null;
  notes: string | null;
  approved: boolean;
  created_at: string;
}

export type VideoGenerationStatus = 'pending' | 'submitted' | 'processing' | 'succeed' | 'failed';

export interface SceneVideo {
  id: string;
  project_id: string;
  scene_image_id: string;
  scene_number: number;
  scene_title: string | null;
  task_id: string | null;
  generation_status: VideoGenerationStatus;
  task_status_msg: string | null;
  video_url: string | null;
  duration: string | null;
  approved: boolean;
  rejected: boolean;
  needs_review: boolean;
  updated_after_approval: boolean;
  last_approved_at: string | null;
  prompt_used: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImageGenerationBatch {
  id: string;
  project_id: string;
  generation_started_at: string | null;
  generation_completed_at: string | null;
  total_scenes: number;
  generated_scenes: number;
  approved_scenes: number;
  status: BatchStatus;
  created_at: string;
  updated_at: string;
}

export interface ConsistencySettings {
  character: boolean;
  environment: boolean;
  style: boolean;
  storyboard: boolean;
  allowVariation: boolean;
}

export interface BetaFeedback {
  id: string;
  project_id: string;
  user_id: string | null;
  understanding_score: number | null;
  world_accuracy_score: number | null;
  gave_new_ideas: boolean | null;
  trust_to_generate_video: boolean | null;
  what_felt_right: string | null;
  what_felt_wrong_or_missing: string | null;
  what_would_change: string | null;
  would_use_again: boolean | null;
  would_recommend: boolean | null;
  final_notes: string | null;
  created_at: string;
}

export interface CreatorMemory {
  id: string;
  user_id: string;
  favorite_styles: string[] | null;
  recurring_themes: string[] | null;
  preferred_colors: string[] | null;
  preferred_worlds: string[] | null;
  character_preferences: string | null;
  storytelling_patterns: string | null;
  past_project_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ChangeType =
  | 'edited_after_approval'
  | 'regenerated_after_approval'
  | 'marked_downstream_needs_review'
  | 'reapproved'
  | 'kept_later_sections_unchanged';

export type ChangeReviewStatus = 'pending' | 'reviewed' | 'reapproved' | 'skipped';

export interface ProjectChangeLog {
  id: string;
  project_id: string;
  section_name: string;
  section_type: string;
  section_record_id: string | null;
  change_type: ChangeType;
  change_summary: string | null;
  affected_sections: string[];
  user_choice: string | null;
  review_status: ChangeReviewStatus;
  created_at: string;
}

export const VISUAL_STYLES = [
  'Cinematic',
  'Cyberpunk',
  'Fantasy',
  'Viking',
  'Anime',
  'Horror',
  'Dreamlike',
  'Post-Apocalyptic',
  'Modern Drama',
  'Concert Performance',
  'Abstract Emotion',
  'Custom',
] as const;

export type VisualStyle = typeof VISUAL_STYLES[number];

// ── Phase 4: Motion and Video Rendering ──────────────────────────────────────

export type MotionClipStatus =
  | 'not_generated'
  | 'generating'
  | 'ready_for_review'
  | 'approved'
  | 'failed'
  | 'needs_regeneration';

export type RenderJobStatus = 'pending' | 'running' | 'complete' | 'failed';

/** Wider status set used by final_videos.render_status */
export type FinalVideoRenderStatus =
  | RenderJobStatus
  | 'Preview Ready'
  | 'Browser Rendered'
  | 'Simulated Preview'
  | 'Manifest Only';

export type RenderType = 'preview' | 'final';

export interface MotionSettings {
  id: string;
  project_id: string;
  motion_style: string;
  transition_style: string;
  caption_style: string;
  video_format: string;
  video_quality: string;
  add_beat_camera_movement: boolean;
  add_zoom_pan: boolean;
  add_cinematic_grain: boolean;
  add_scene_title_cards: boolean;
  add_lyric_captions: boolean;
  add_transition_effects: boolean;
  keep_motion_gentle: boolean;
  make_motion_intense: boolean;
  approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface SceneMotionPlan {
  id: string;
  project_id: string;
  storyboard_scene_id: string | null;
  scene_image_id: string | null;
  scene_number: number;
  scene_title: string | null;
  timestamp_range: string | null;
  duration: number | null;
  motion_effect: string;
  transition_in: string;
  transition_out: string;
  caption_text: string | null;
  lyric_moment: string | null;
  include_in_final_video: boolean;
  approved: boolean;
  pending: boolean;
  failed: boolean;
  rejected: boolean;
  needs_review: boolean;
  updated_after_approval: boolean;
  last_approved_at: string | null;
  status: MotionClipStatus;
  created_at: string;
  updated_at: string;
}

export interface MotionClip {
  id: string;
  project_id: string;
  scene_motion_plan_id: string | null;
  storyboard_scene_id: string | null;
  scene_image_id: string | null;
  scene_number: number;
  scene_title: string | null;
  clip_url: string | null;
  preview_url: string | null;
  duration: number | null;
  motion_effect: string;
  transition_in: string;
  transition_out: string;
  caption_text: string | null;
  generation_status: MotionClipStatus;
  status: MotionClipStatus;
  approved: boolean;
  rejected: boolean;
  fallback_generated: boolean;
  pending: boolean;
  failed: boolean;
  needs_review: boolean;
  updated_after_approval: boolean;
  last_approved_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoRenderJob {
  id: string;
  project_id: string;
  render_type: RenderType;
  status: RenderJobStatus;
  video_format: string | null;
  video_quality: string | null;
  output_url: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinalVideo {
  id: string;
  project_id: string;
  title: string | null;
  video_url: string | null;
  preview_video_url: string | null;
  audio_file: string | null;
  duration: number | null;
  format: string | null;
  quality: string | null;
  render_status: FinalVideoRenderStatus;
  downloadable: boolean;
  segment_count: number | null;
  render_manifest_url: string | null;
  created_at: string;
  updated_at: string;
}

// Motion style options
export const MOTION_STYLES = [
  'Cinematic Slow Push',
  'Beat-Synced Cuts',
  'Handheld Energy',
  'Dreamlike Drift',
  'Glitch / Cyberpunk',
  'Hard Rock Impact',
  'Emotional Slow Motion',
  'Custom',
] as const;

export const TRANSITION_STYLES = [
  'Fade',
  'Hard Cut',
  'Cross Dissolve',
  'Whip Pan',
  'Glitch Cut',
  'Flash Cut',
  'Smoke Fade',
  'Match Cut',
] as const;

export const CAPTION_STYLES = [
  'No Captions',
  'Lyric Captions',
  'Scene Titles Only',
  'Lyric Moments Only',
  'Full Storyboard Captions',
] as const;

export const VIDEO_FORMATS = [
  '16:9 Landscape',
  '9:16 Vertical',
  '1:1 Square',
] as const;

export const VIDEO_QUALITIES = [
  'Draft Preview',
  'Standard 720p',
  'HD 1080p',
] as const;

export const MOTION_EFFECTS = [
  'Slow Zoom In',
  'Slow Zoom Out',
  'Pan Left',
  'Pan Right',
  'Tilt Up',
  'Tilt Down',
  'Parallax Drift',
  'Subtle Shake',
  'Beat Pulse',
  'Flash Impact',
  'Glitch Flicker',
  'Still Frame',
] as const;

// ── Phase 3+: Image Provider Settings ────────────────────────────────────────

export const IMAGE_PROVIDER_OPTIONS = [
  'Disabled',
  'Manual Upload Only',
  'OpenAI Image',
  'Stability Image',
  'Replicate Image',
  'Custom Image API',
  'Local Image API',
] as const;

export type ImageProviderName = typeof IMAGE_PROVIDER_OPTIONS[number];

export interface ImageProviderSettings {
  id: string;
  project_id: string;
  real_ai_providers_enabled: boolean;
  provider_name: ImageProviderName;
  api_key: string | null;
  api_endpoint: string | null;
  model_name: string | null;
  output_size: string | null;
  aspect_ratio: string;
  enabled: boolean;
  test_mode: boolean;
  created_at: string;
  updated_at: string;
}

// ── Phase 3+: Video Segments ──────────────────────────────────────────────────

export type VideoSegmentRenderStatus =
  | 'Not Rendered'
  | 'Preview Ready'
  | 'Simulated Preview'
  | 'Browser Rendered'
  | 'Server Rendered'
  | 'Completed'
  | 'Approved'
  | 'Failed';

export type SegmentationMode =
  | 'Use Storyboard Scenes'
  | 'Split by Lyrics'
  | 'Split Every 5 Seconds'
  | 'Split Every 10 Seconds'
  | 'Split Every 15 Seconds'
  | 'Custom Segment Length';

export interface VideoSegment {
  id: string;
  project_id: string;
  segment_number: number;
  source_storyboard_scene_id: string | null;
  source_scene_image_id: string | null;
  start_time: number;
  end_time: number;
  duration: number;
  segment_title: string | null;
  image_url: string | null;
  motion_effect: string;
  transition_in: string;
  transition_out: string;
  caption_text: string | null;
  lyric_text: string | null;
  audio_start_time: number | null;
  audio_end_time: number | null;
  render_status: VideoSegmentRenderStatus;
  video_url: string | null;
  fallback_rendered: boolean;
  provider_rendered: boolean;
  simulated_preview: boolean;
  error_message: string | null;
  approved: boolean;
  active: boolean;
  pending: boolean;
  failed: boolean;
  created_at: string;
  updated_at: string;
}

// Render manifest exported as JSON
export interface RenderManifestSegment {
  segment_number: number;
  start_time: number;
  end_time: number;
  duration: number;
  segment_title: string | null;
  image_url: string | null;
  motion_effect: string;
  transition_in: string;
  transition_out: string;
  caption_text: string | null;
  lyric_text: string | null;
  storyboard_scene_source: string | null;
  approved: boolean;
  render_status: VideoSegmentRenderStatus;
}

export interface RenderManifest {
  project_title: string;
  song_file_name: string | null;
  song_duration: number | null;
  segment_count: number;
  segments: RenderManifestSegment[];
  generated_at: string;
}

