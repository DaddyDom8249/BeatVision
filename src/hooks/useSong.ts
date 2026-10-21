import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { Song } from "../types/song";

const CURRENT_SONG_COLUMNS = "id,project_id,title,artist,audio_path,audio_revision,lyrics,creative_direction,notes,visual_style_preferences,analysis_status,analysis,audio_source_fingerprint,audio_source_fingerprint_algorithm,audio_source_size,audio_source_fingerprinted_at,current_interpretation_id,interpretation_confirmed_at,analyzed_at,created_at,updated_at";
const LEGACY_SONG_COLUMNS = "id,project_id,title,artist,audio_path,audio_revision,lyrics,creative_direction,notes,analysis_status,analysis,analyzed_at,created_at,updated_at";
const NEW_SONG_COLUMNS = ["visual_style_preferences", "audio_source_fingerprint", "audio_source_fingerprint_algorithm", "audio_source_size", "audio_source_fingerprinted_at", "current_interpretation_id", "interpretation_confirmed_at"];

function isMissingNewSongColumn(error: { code?: string; message: string }) {
  // Only allow a known missing-column error to trigger compatibility mode.
  // Permission, network, and unknown-schema errors must remain visible.
  return (error.code === "42703" || error.code === "PGRST204") &&
    NEW_SONG_COLUMNS.some((column) => error.message.includes(column));
}

export function useSong(projectId?: string) {
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  const [schemaReady, setSchemaReady] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    const current = await supabase.from("songs")
      .select(CURRENT_SONG_COLUMNS)
      .eq("project_id", projectId).maybeSingle();
    let data: any = current.data;
    let error = current.error;
    let compatible = true;
    if (error && isMissingNewSongColumn(error)) {
      const legacy = await supabase.from("songs")
        .select(LEGACY_SONG_COLUMNS)
        .eq("project_id", projectId).maybeSingle();
      data = legacy.data;
      error = legacy.error;
      compatible = false;
    }
    if (error) {
      // Preserve the last known DB state during a transient reload failure.
      // Clearing song here can make a successful analysis/save look like it
      // disappeared and can strand the user on an apparently empty form.
      setError(error.message);
    } else {
      setSchemaReady(compatible);
      if (!data) {
        setSong(null);
      } else {
      let audio_url: string | null = null;
      if (data.audio_path) {
        const signed = await supabase.storage.from("songs").createSignedUrl(data.audio_path, 3600);
        if (signed.error) {
          setError(signed.error.message);
        }
        audio_url = signed.data?.signedUrl ?? null;
      }
      setSong({ ...(data as Song), audio_url });
      }
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return { song, loading, error, schemaReady, reload: load };
}
