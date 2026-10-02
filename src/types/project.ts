export interface Project {
  id: string;
  owner_id: string;
  title: string;
  status: string;
  song_duration?: number | null;
  created_at: string;
  updated_at: string;
}
