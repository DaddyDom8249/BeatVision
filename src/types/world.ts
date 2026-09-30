export type WorldReportStatus = "pending" | "completed" | "unavailable" | "failed";

export interface WorldReport {
  id: string; project_id: string; status: WorldReportStatus;
  mood: unknown; emotional_arc: unknown; visual_language: unknown;
  cinematography: unknown; environments: unknown; color_lighting: unknown;
  motifs: unknown; atmosphere: unknown; movement: unknown;
  continuity_rules: unknown; immutable_continuity: unknown; raw_report: unknown;
  provider: string | null; provider_request_id: string | null;
  error_code: string | null; error_message: string | null;
  confirmed_at: string | null; created_at: string; updated_at: string;
}
