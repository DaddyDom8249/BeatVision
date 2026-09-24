import { createClient } from "@supabase/supabase-js";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "[BeatVision] Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before running the application."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
