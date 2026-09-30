export interface Project {
  id: string;
  user_id: string;
  title: string;
  status: "draft" | "active";
  created_at: string;
  updated_at: string;
}
