import { createClient } from "@supabase/supabase-js";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "[BeatVision] Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before running the application."
  );
}

const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

const originalFunctionsInvoke = supabaseClient.functions.invoke.bind(supabaseClient.functions);

(supabaseClient.functions as any).invoke = async (functionName: string, options: any = {}) => {
  if (functionName === 'beatvision-generate' && typeof window !== 'undefined') {
    const body = options?.body;
    if (body && typeof body === 'object' && !Array.isArray(body) && !body.projectId) {
      const match = window.location.pathname.match(/^\/project\/([^/]+)/);
      if (match?.[1]) {
        options = { ...options, body: { ...body, projectId: decodeURIComponent(match[1]) } };
      }
    }
  }
  return originalFunctionsInvoke(functionName, options);
};

export const supabase = supabaseClient;
