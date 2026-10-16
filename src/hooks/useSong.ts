import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { Song } from "../types/song";

export function useSong(projectId?: string) {
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    const { data, error } = await supabase.from("songs")
      .select("id,project_id,title,artist,audio_path,audio_revision,lyrics,creative_direction,notes,analysis_status,analysis,analyzed_at,created_at,updated_at")
      .eq("project_id", projectId).maybeSingle();
    if (error) {
      // Preserve the last known DB state during a transient reload failure.
      // Clearing song here can make a successful analysis/save look like it
      // disappeared and can strand the user on an apparently empty form.
      setError(error.message);
    } else if (!data) {
      setSong(null);
    } else {
      let audio_url: string | null = null;
      if (data.audio_path) {
        if (data.audio_path.includes('..')) {
          throw new Error('Invalid audio path');
        }
        const signed = await supabase.storage.from("songs").createSignedUrl(data.audio_path, 3600);
        if (signed.error) {
          setError(signed.error.message);
        }
        audio_url = signed.data?.signedUrl ?? null;
      }
      setSong({ ...(data as Song), audio_url });
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return { song, loading, error, reload: load };
}
