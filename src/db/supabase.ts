
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "https://mdofsinyofqbeapzfygu.supabase.co").trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_x28OGL5xvygpE1ekq77Lqw_8Aa4Rioa").trim();

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn(
    "[BeatVision] Vercel Supabase environment variables are missing; using the project's public Supabase URL and publishable key fallback."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
            