export type StyleBibleStatus = "draft" | "approved";
export type AssetStatus = "draft" | "approved";

export interface StyleBible {
  id: string;
  project_id: string;
  world_report_id: string;
  status: StyleBibleStatus;
  world_basis: unknown;
  visual_language: unknown;
  cinematography: unknown;
  color_lighting: unknown;
  atmosphere: unknown;
  movement: unknown;
  continuity_rules: unknown;
  visual_rules: unknown;
  reference_assets: unknown;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Character {
  id: string;
  project_id: string;
  world_report_id: string;
  style_bible_id: string;
  name: string;
  status: "draft" | "approved";
  sheet: Record<string, string>;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterAsset {
  id: string;
  project_id: string;
  world_report_id: string;
  character_id: string;
  kind: string;
  label: string;
  storage_path: string;
  status: AssetStatus;
  metadata: Record<string, unknown>;
  approved_at: string | null;
  supersedes_asset_id: string | null;
  created_at: string;
  signed_url?: string | null;
}

export interface Environment {
  id: string;
  project_id: string;
  world_report_id: string;
  style_bible_id: string;
  name: string;
  status: "draft" | "approved";
  sheet: Record<string, string>;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnvironmentAsset {
  id: string;
  project_id: string;
  world_report_id: string;
  environment_id: string;
  kind: string;
  label: string;
  storage_path: string;
  status: AssetStatus;
  metadata: Record<string, unknown>;
  approved_at: string | null;
  supersedes_asset_id: string | null;
  created_at: string;
  signed_url?: string | null;
}
