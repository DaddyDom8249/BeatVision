export type SongAnalysisStatus = "not_started" | "analyzing" | "completed" | "failed";

export interface EnergyRegionCandidate {
  start_time: number;
  end_time: number;
  mean_energy: number;
  change_score: number;
}

export interface SongAnalysis {
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  peak: number;
  rms: number;
  silence_ratio: number;
  energy_curve: Array<{ time: number; energy: number }>;
  energy_region_candidates: EnergyRegionCandidate[];
  analysis_method: "browser_audio_decode";
  structure_method: "energy_change_heuristic";
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
