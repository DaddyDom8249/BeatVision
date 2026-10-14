/** Forge command contract. Pure, deterministic, and provider-neutral. */
export const FORGE_COMMANDS = ["inspect_job", "validate_stage", "explain_failure", "plan_retry"] as const;
export type ForgeCommand = typeof FORGE_COMMANDS[number];
export type ForgeStage = "world" | "style" | "storyboard" | "assets" | "motion" | "assembly";
export type JobStatus = "queued" | "submitted" | "processing" | "completed" | "failed";
export interface ForgeJob {
  id: string;
  project_id: string;
  job_type: string;
  status: JobStatus;
  error?: unknown;
  output?: unknown;
}
export interface ForgeRequest {
  command: ForgeCommand;
  projectId: string;
  stage?: ForgeStage;
  job?: ForgeJob;
  approved?: boolean;
  assets?: { id: string; approved: boolean; url?: string | null }[];
}
export interface ForgeResult {
  ok: boolean;
  command: ForgeCommand;
  reason: string;
  nextAction: string | null;
  requiresApproval: boolean;
}
const stages: ForgeStage[] = ["world", "style", "storyboard", "assets", "motion", "assembly"];
const statuses: JobStatus[] = ["queued", "submitted", "processing", "completed", "failed"];
export function executeForgeCommand(request: ForgeRequest): ForgeResult {
  if (!request || !FORGE_COMMANDS.includes(request.command) || !request.projectId?.trim()) {
    throw new Error("Invalid Forge command or project identifier");
  }
  const { command, projectId, job, stage } = request;
  if (stage && !stages.includes(stage)) throw new Error("Unknown Forge stage");
  if (job && (job.project_id !== projectId || !statuses.includes(job.status))) {
    throw new Error("Job does not belong to this project or has an invalid status");
  }
  if (command === "inspect_job" || command === "explain_failure") {
    if (!job) return { ok: false, command, reason: "Job data is required", nextAction: null, requiresApproval: false };
    const reason = job.status === "failed"
      ? (typeof job.error === "string" ? job.error : "Job failed; inspect provider error details")
      : `Job status: ${job.status}`;
    return { ok: job.status === "completed", command, reason, nextAction: job.status === "failed" ? "inspect_provider_and_eligibility" : null, requiresApproval: false };
  }
  if (command === "validate_stage") {
    if (!stage) throw new Error("Stage is required");
    const missing = (request.assets ?? []).filter(a => !a.id || !a.approved || !a.url);
    const needsAssets = stage === "motion" || stage === "assembly";
    const valid = request.approved === true && (!needsAssets || !!request.assets?.length && missing.length === 0);
    return { ok: valid, command, reason: valid ? "Stage prerequisites supplied" : "Missing explicit approval or approved assets with output URLs", nextAction: valid ? null : "review_stage_prerequisites", requiresApproval: !valid };
  }
  if (!job) return { ok: false, command, reason: "Job data is required", nextAction: null, requiresApproval: false };
  if (job.status !== "failed") return { ok: false, command, reason: "Only failed jobs can be considered for retry", nextAction: null, requiresApproval: false };
  return { ok: true, command, reason: "Retry candidate only; provider eligibility, idempotency, ownership and current approval must be rechecked server-side", nextAction: "review_retry_in_existing_controller", requiresApproval: true };
}
