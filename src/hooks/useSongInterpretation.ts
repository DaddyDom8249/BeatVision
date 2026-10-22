import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { SongInterpretationDraft, SongInterpretationEvidence, SongInterpretationDocument } from "../types/song";

type DraftInput = {
  interpretation: Partial<SongInterpretationDocument>;
  evidence: SongInterpretationEvidence[];
};

function errorMessage(error: unknown, data: any, fallback: string) {
  if (data?.error?.message) return String(data.error.message);
  if (error && typeof error === "object" && "message" in error) return String((error as { message: string }).message);
  return fallback;
}

export function useSongInterpretation(projectId?: string, songId?: string, currentInterpretationId?: string | null) {
  const [drafts, setDrafts] = useState<SongInterpretationDraft[]>([]);
  const [loading, setLoading] = useState(Boolean(projectId && songId));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualFallback, setManualFallback] = useState(false);

  const load = useCallback(async () => {
    if (!projectId || !songId) {
      setDrafts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke("beatvision-song-interpretation", {
      body: { projectId, songId, action: "get" },
    });
    if (invokeError) {
      setError(errorMessage(invokeError, data, "Song interpretation could not be loaded."));
    } else {
      setDrafts(Array.isArray(data?.drafts) ? data.drafts as SongInterpretationDraft[] : []);
    }
    setLoading(false);
  }, [projectId, songId]);

  useEffect(() => { void load(); }, [load]);

  const saveDraft = useCallback(async (input: DraftInput, sourceType: "manual" | "artist_edited" = "manual") => {
    if (!projectId || !songId || working) return null;
    setWorking(true);
    setError(null);
    setManualFallback(false);
    const { data, error: invokeError } = await supabase.functions.invoke("beatvision-song-interpretation", {
      body: { projectId, songId, action: "save_draft", source_type: sourceType, ...input },
    });
    if (invokeError) {
      const message = errorMessage(invokeError, data, "Interpretation draft could not be saved.");
      setError(message);
      setWorking(false);
      return null;
    }
    if (data?.draft) setDrafts((current) => [data.draft as SongInterpretationDraft, ...current]);
    setWorking(false);
    return data?.draft as SongInterpretationDraft | null;
  }, [projectId, songId, working]);

  const propose = useCallback(async () => {
    if (!projectId || !songId || working) return null;
    setWorking(true);
    setError(null);
    setManualFallback(false);
    const { data, error: invokeError } = await supabase.functions.invoke("beatvision-song-interpretation", {
      body: { projectId, songId, action: "propose" },
    });
    if (invokeError) {
      const message = errorMessage(invokeError, data, "AI interpretation is unavailable.");
      setError(message);
      setManualFallback(Boolean(data?.manual_fallback) || message.includes("PROVIDER_COST_UNVERIFIED"));
      setWorking(false);
      return null;
    }
    if (data?.draft) setDrafts((current) => [data.draft as SongInterpretationDraft, ...current]);
    setWorking(false);
    return data?.draft as SongInterpretationDraft | null;
  }, [projectId, songId, working]);

  const confirm = useCallback(async (interpretationId: string) => {
    if (!projectId || !songId || working) return null;
    setWorking(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke("beatvision-song-interpretation", {
      body: { projectId, songId, action: "confirm", interpretation_id: interpretationId },
    });
    if (invokeError) {
      setError(errorMessage(invokeError, data, "Interpretation confirmation failed."));
      setWorking(false);
      return null;
    }
    if (data?.interpretation) {
      setDrafts((current) => current.map((draft) => draft.id === data.interpretation.id
        ? data.interpretation as SongInterpretationDraft
        : draft));
    }
    setWorking(false);
    return data?.interpretation as SongInterpretationDraft | null;
  }, [projectId, songId, working]);

  const confirmed = drafts.find((draft) => draft.status === "confirmed" && draft.id === currentInterpretationId) ?? null;
  const latestDraft = drafts.find((draft) => draft.status === "draft") ?? null;

  return {
    drafts,
    latestDraft,
    confirmed,
    loading,
    working,
    error,
    manualFallback,
    saveDraft,
    propose,
    confirm,
    reload: load,
  };
}
