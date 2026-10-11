import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase/client";
import { getCreativeErrorMessage } from "../lib/formatCreativeText";
import type { Song } from "../types/song";

export function useSong(projectId?: string) {
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    const isCurrent = () => version === requestVersion.current;
    if (!projectId) {
      setSong(null);
      setError(null);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const { data, error } = await supabase.from("songs")
        .select("id,project_id,title,artist,audio_path,audio_revision,lyrics,creative_direction,notes,analysis_status,analysis,analyzed_at,created_at,updated_at")
        .eq("project_id", projectId).maybeSingle();
      if (!isCurrent()) return;
      if (error) {
        setError(error.message);
        // Preserve the persisted song during a same-project transient reload failure.
      } else if (!data) {
        setSong(null);
      } else {
        let audio_url: string | null = null;
        if (data.audio_path) {
          const signed = await supabase.storage.from("songs").createSignedUrl(data.audio_path, 3600);
          if (!isCurrent()) return;
          if (signed.error) setError(signed.error.message);
          audio_url = signed.data?.signedUrl ?? null;
        }
        setSong({ ...(data as Song), audio_url });
      }
    } catch (error) {
      if (!isCurrent()) return;
      setError(getCreativeErrorMessage(error, "Unable to load song."));
      // Keep the last persisted song when a same-project transport request fails.
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setSong(null);
    setError(null);
    setLoading(Boolean(projectId));
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);

  return { song, loading, error, reload: load };
}
