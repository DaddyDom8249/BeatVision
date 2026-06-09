/**
 * BeatVision — Credit-Safe Mode & Provider Safety Config
 *
 * Reads VITE_CREDIT_SAFE_MODE and VITE_REAL_AI_PROVIDERS_ENABLED from env.
 * Both default to the SAFE value (true / false respectively) if not set,
 * so the app is safe on first deploy without any env vars.
 */

/**
 * Credit-Safe Mode is ON when VITE_CREDIT_SAFE_MODE=true (or not set).
 * When ON: no real AI providers will be triggered, no credits consumed.
 */
export const CREDIT_SAFE_MODE: boolean =
  import.meta.env.VITE_CREDIT_SAFE_MODE !== 'false';

/**
 * Real AI Providers are disabled when VITE_REAL_AI_PROVIDERS_ENABLED=false (or not set).
 * Must be explicitly set to 'true' to unlock real provider calls.
 */
export const REAL_AI_PROVIDERS_ENABLED: boolean =
  import.meta.env.VITE_REAL_AI_PROVIDERS_ENABLED === 'true';

/**
 * Supabase environment check — returns true if both vars are configured.
 */
export const SUPABASE_CONFIGURED: boolean =
  !!import.meta.env.VITE_SUPABASE_URL &&
  !!import.meta.env.VITE_SUPABASE_ANON_KEY;
