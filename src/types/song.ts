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
  created_at: string;
  updated_at: string;
}
