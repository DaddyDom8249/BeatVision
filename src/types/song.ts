export type SongAnalysisStatus = "not_started" | "analyzing" | "completed" | "failed";

export interface EnergyRegionCandidate {
  start_time: number;
  end_time: number;
  mean_energy: number;
  change_score: number;
}

export interface SongAnalysis {
  duration_seconds: number;
  sample_rate?: number;
  channels?: number;
  peak?: number;
  rms?: number;
  silence_ratio?: number;
  energy_curve?: Array<{ time: number; energy: number }>;
  energy_region_candidates?: EnergyRegionCandidate[];
  bpm?: number | null;
  bpm_confidence?: number | null;
  key?: string | null;
  key_confidence?: number | null;
  time_signature?: string | null;
  time_signature_confidence?: number | null;
  sections?: Array<{ index: number; start_time: number; end_time: number }>;
  genre_tags?: string[];
  mood_tags?: string[];
  mood_scores?: Record<string, number> | null;
  movement_tags?: string[];
  valence_arousal?: {
    scores?: Record<string, number> | null;
    energy_level?: string | null;
    energy_changes?: string | null;
    emotion_profile?: string | null;
    emotion_changes?: string | null;
    segments?: unknown;
  } | null;
  instruments?: string[];
  vocal_presence?: string | null;
  vocal_tags?: string[];
  description?: string | null;
  transcript?: string | null;
  transcript_segments?: Array<{ start?: number; end?: number; text?: string }>;
  word_timestamps?: Array<{ start?: number; end?: number; word?: string }>;
  transcription_provider?: string;
  transcription_model?: string;
  transcription_method?: string;
  transcription_status?: "completed" | "failed" | "unavailable";
  provider?: string;
  provider_track_id?: string;
  provider_models?: string[];
  analysis_method: "browser_audio_decode" | "cyanite_music_intelligence";
  structure_method: "energy_change_heuristic" | "Cyanite SegmentationV1";
  raw_provider_output?: unknown;
  status_detail?: string;
}

export interface Song {
  id: string;
  project_id: string;
  title: string;
  artist: string;
  audio_path: string | null;
  audio_revision: string;
  audio_url?: string | null;
  lyrics: string | null;
  creative_direction: string | null;
  notes: string | null;
  visual_style_preferences?: {
    preferred_visual_style?: string;
    imagery_mode?: "realistic" | "stylized";
    narrative_mode?: "narrative" | "abstract";
    unwanted_themes?: string;
  } | null;
  analysis_status: SongAnalysisStatus;
  analysis: SongAnalysis | null;
  audio_source_fingerprint?: string | null;
  audio_source_fingerprint_algorithm?: string | null;
  audio_source_size?: number | null;
  audio_source_fingerprinted_at?: string | null;
  current_interpretation_id?: string | null;
  interpretation_confirmed_at?: string | null;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SongInterpretationSource = "ai" | "manual" | "artist_edited";
export type SongInterpretationStatus = "draft" | "confirmed" | "superseded";

export interface SongInterpretationEvidence {
  id: string;
  kind: "signal" | "lyrics" | "artist" | "manual";
  reference: string;
  excerpt?: string | null;
  value?: unknown;
}

export interface SongInterpretationClaim {
  text: string;
  confidence: number | "artist_authored" | null;
  evidence_refs: string[];
}

export interface SongInterpretationDocument {
  schema_version: number;
  summary: string;
  themes: string[];
  emotional_arc: string;
  visual_motifs: string[];
  narrative: string;
  claims: SongInterpretationClaim[];
}

export interface SongInterpretationDraft {
  id: string;
  project_id: string;
  song_id: string;
  audio_revision: string;
  source_fingerprint: string;
  source_fingerprint_algorithm: string;
  version: number;
  status: SongInterpretationStatus;
  source_type: SongInterpretationSource;
  interpretation: SongInterpretationDocument;
  evidence: SongInterpretationEvidence[];
  provider: string | null;
  model: string | null;
  provenance: Record<string, unknown>;
  created_by: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}
