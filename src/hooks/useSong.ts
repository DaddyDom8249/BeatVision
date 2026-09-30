import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { Song } from "../types/song";

export function useSong(projectId?: string) {
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true); setError(null);
    const { data, error } = await supabase.from("songs")
      .select("id,project_id,title,artist,audio_path,lyrics,creative_direction,notes,created_at,updated_at")
      .eq("project_id", projectId).maybeSingle();
    if (error) { setError(error.message); setSong(null); }
    else if (!data) setSong(null);
    else {
      let audio_url: string | null = null;
      if (data.audio_path) {
        const signed = await supabase.storage.from("audio").createSignedUrl(data.audio_path, 3600);
        audio_url = signed.data?.signedUrl ?? null;
      }
      setSong({ ...(data as Song), audio_url });
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);
  return { song, loading, error, reload: load };
}
