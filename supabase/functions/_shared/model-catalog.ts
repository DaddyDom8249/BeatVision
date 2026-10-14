// BeatVision generation model catalog: the single source of truth shared by
// the browser (display + estimate) and the beatvision-generation edge function
// (enforcement). Pure data and pure functions only: no Deno, DOM, or network
// access, so it can be imported from both runtimes and from node tests.
//
// Pricing rules:
// - Every number below is copied from a public provider pricing page, with the
//   URL and the date it was read recorded beside it. Nothing is inferred.
// - When the billed provider, tier, or parameters cannot be verified from this
//   repository, the estimate is "unknown" and approval is still required.
// - A model may skip the approval prompt only when `verifiedFree` is true. No
//   model routed through the Arena gateway qualifies today, because Arena can
//   fall back to providers that bill past a free allocation.

export type GenerationJobType = "scene_image" | "scene_motion" | "assembly";

export type PricingSource = { url: string; readOn: string; note: string };

export type CostEstimate =
  | { kind: "free"; currency: "USD"; minUsd: 0; maxUsd: 0; basis: string; sources: PricingSource[] }
  | { kind: "range"; currency: "USD"; minUsd: number; maxUsd: number; basis: string; sources: PricingSource[] }
  | { kind: "unknown"; basis: string; sources: PricingSource[] };

export type ModelEntry = {
  id: string;
  label: string;
  jobType: GenerationJobType;
  provider: string;
  /** Model name passed to the provider gateway. */
  providerModel: string;
  /** Server env vars that must all be set for the model to be available. */
  requiresEnv: string[];
  /** Only true when zero cost is verifiable end to end. */
  verifiedFree: boolean;
  pricing:
    | { kind: "per_unit_range"; unit: "image" | "second" | "render"; minUsd: number; maxUsd: number; basis: string; sources: PricingSource[] }
    | { kind: "unknown"; basis: string; sources: PricingSource[] };
};

/** Bump whenever any pricing data below changes; approvals record it. */
export const PRICING_VERSION = "2026-10-14.1";

const ARENA_ENV = ["ARENA_GATEWAY_URL", "ARENA_GATEWAY_TOKEN"];

const PIXAZO_PRICING: PricingSource = {
  url: "https://www.pixazo.ai/api/pricing-plan",
  readOn: "2026-10-14",
  note: "Lists 'Flux Schnell API: FREE (all resolutions)' and 'LTX Video 2.5: FREE, per video (5 s, 1280×704)'. Arena's own code handles a Pixazo 402 'Add a card to use your monthly Pixazo Free Tier', so the free tier is quota-limited.",
};
const PIXAZO_FLUX_PAID: PricingSource = {
  url: "https://www.pixazo.ai/blog/flux-schnell-api-cheapest-pricing",
  readOn: "2026-10-14",
  note: "Pixazo paid Flux Schnell rate: $0.0012 per image.",
};
const CLOUDFLARE_WORKERS_AI: PricingSource = {
  url: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  readOn: "2026-10-14",
  note: "Arena falls back to Workers AI @cf/black-forest-labs/flux-1-schnell on Pixazo 402/403: $0.0000528 per 512x512 tile + $0.0001056 per step, after 10,000 free Neurons/day (Workers Paid). Arena's fallback size and step count are not verified, so the fallback is not included in the range.",
};
const ARENA_CAPABILITIES: PricingSource = {
  url: "https://github.com/DaddyDom8249/beatvision-arena/blob/main/worker/src/video-fallback-gateway.ts",
  readOn: "2026-10-14",
  note: "Arena /v1/capabilities reports video billing_safety 'unknown_cost_block_for_strict_free'; which Pixazo LTX product /ltx-video/v1/image-to-video bills against is not documented.",
};

export const MODEL_CATALOG: readonly ModelEntry[] = [
  {
    id: "arena:flux-schnell",
    label: "Flux Schnell (via Arena → Pixazo)",
    jobType: "scene_image",
    provider: "arena",
    providerModel: "flux-schnell",
    requiresEnv: ARENA_ENV,
    verifiedFree: false,
    pricing: {
      kind: "per_unit_range",
      unit: "image",
      minUsd: 0,
      maxUsd: 0.0012,
      basis: "$0 on the Pixazo free tier, up to $0.0012/image on Pixazo paid. A Workers AI fallback is billed separately (see sources).",
      sources: [PIXAZO_PRICING, PIXAZO_FLUX_PAID, CLOUDFLARE_WORKERS_AI],
    },
  },
  {
    id: "arena:ltx-video",
    label: "LTX Video (via Arena → Pixazo)",
    jobType: "scene_motion",
    provider: "arena",
    providerModel: "ltx-video",
    requiresEnv: ARENA_ENV,
    verifiedFree: false,
    pricing: {
      kind: "unknown",
      basis: "The Pixazo LTX product and tier that Arena calls, and its Shotstack fallback, are not verifiable from this repository.",
      sources: [PIXAZO_PRICING, ARENA_CAPABILITIES],
    },
  },
  {
    id: "arena:wan2.2-zerogpu",
    label: "Wan 2.2 (via Arena → Hugging Face ZeroGPU)",
    jobType: "scene_motion",
    provider: "arena",
    providerModel: "wan2.2-zerogpu",
    requiresEnv: ARENA_ENV,
    verifiedFree: false,
    pricing: {
      kind: "unknown",
      basis: "Arena reports a free-account daily ZeroGPU quota, but the account plan is only checked at request time. Not verified.",
      sources: [ARENA_CAPABILITIES],
    },
  },
  {
    id: "arena:shotstack",
    label: "Shotstack assembly (via Arena)",
    jobType: "assembly",
    provider: "arena",
    providerModel: "shotstack",
    requiresEnv: ARENA_ENV,
    verifiedFree: false,
    pricing: {
      kind: "unknown",
      basis: "Arena reports 'shotstack-sandbox', but its live Shotstack environment and plan are not verified.",
      sources: [ARENA_CAPABILITIES],
    },
  },
];

export const DEFAULT_MODEL: Record<GenerationJobType, string> = {
  scene_image: "arena:flux-schnell",
  scene_motion: "arena:ltx-video",
  assembly: "arena:shotstack",
};

export function findModel(id: unknown): ModelEntry | null {
  return MODEL_CATALOG.find((model) => model.id === String(id ?? "")) ?? null;
}

export function modelsFor(jobType: GenerationJobType): ModelEntry[] {
  return MODEL_CATALOG.filter((model) => model.jobType === jobType);
}

/** True unless the model is verifiably free. Unknown cost always needs approval. */
export function requiresApproval(model: ModelEntry): boolean {
  return !model.verifiedFree;
}

export function missingEnv(model: ModelEntry, getEnv: (name: string) => string): string[] {
  return model.requiresEnv.filter((name) => !String(getEnv(name) || "").trim());
}

export type EstimateInput = { units?: number };

/**
 * Estimate a render. `units` is images for scene_image, generated seconds for
 * scene_motion, renders for assembly. It is never guessed: a missing or
 * invalid unit count makes the estimate unknown.
 */
export function estimateCost(model: ModelEntry, input: EstimateInput = {}): CostEstimate {
  const pricing = model.pricing;
  if (pricing.kind === "unknown") return { kind: "unknown", basis: pricing.basis, sources: pricing.sources };
  const units = Number(input.units ?? (pricing.unit === "second" ? NaN : 1));
  if (!Number.isFinite(units) || units <= 0) {
    return { kind: "unknown", basis: "The render size needed to price this model is unknown.", sources: pricing.sources };
  }
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  if (model.verifiedFree && pricing.maxUsd === 0) {
    return { kind: "free", currency: "USD", minUsd: 0, maxUsd: 0, basis: pricing.basis, sources: pricing.sources };
  }
  return { kind: "range", currency: "USD", minUsd: round(pricing.minUsd * units), maxUsd: round(pricing.maxUsd * units), basis: pricing.basis, sources: pricing.sources };
}

export function formatEstimate(estimate: CostEstimate): string {
  if (estimate.kind === "unknown") return "Cost unknown";
  if (estimate.kind === "free") return "Free (verified)";
  const usd = (n: number) => "$" + (n === 0 ? "0" : n < 0.01 ? n.toFixed(4) : n.toFixed(2));
  return estimate.minUsd === estimate.maxUsd ? usd(estimate.maxUsd) : usd(estimate.minUsd) + "–" + usd(estimate.maxUsd);
}
