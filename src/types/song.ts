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
  };
  instruments?: string[];
  vocal_presence?: string | null;
  vocal_tags?: string[];
  description?: string | null;
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
  audio_url?: string | null;
  lyrics: string | null;
  creative_direction: string | null;
  notes: string | null;
  analysis_status: SongAnalysisStatus;
  analysis: SongAnalysis | null;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}
