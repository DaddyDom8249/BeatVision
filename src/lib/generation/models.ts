// Browser-side view of the shared model catalog. The catalog itself lives in
// supabase/functions/_shared so the edge function enforces exactly what the
// UI shows. No provider keys exist in the browser: availability comes from the
// beatvision-generation function, which only reports missing variable names.
export {
  MODEL_CATALOG,
  DEFAULT_MODEL,
  PRICING_VERSION,
  estimateCost,
  findModel,
  formatEstimate,
  modelsFor,
  requiresApproval,
} from "../../../supabase/functions/_shared/model-catalog";
export type { CostEstimate, GenerationJobType, ModelEntry } from "../../../supabase/functions/_shared/model-catalog";

export type ModelAvailability = { id: string; available: boolean; unavailable_reason: string | null };

export type AvailabilityState =
  | { status: "loading" }
  | { status: "loaded"; byId: Record<string, ModelAvailability>; pricingVersion: string }
  | { status: "error"; message: string };

export function parseAvailability(data: any): AvailabilityState {
  if (!data || !Array.isArray(data.models)) return { status: "error", message: "Model availability could not be loaded from the server." };
  const byId: Record<string, ModelAvailability> = {};
  for (const item of data.models) {
    if (item && typeof item.id === "string") byId[item.id] = { id: item.id, available: item.available === true, unavailable_reason: typeof item.unavailable_reason === "string" ? item.unavailable_reason : null };
  }
  return { status: "loaded", byId, pricingVersion: String(data.pricing_version || "") };
}
