import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { Song, SongInterpretationDraft } from "../types/song";

export type DirectorMessage = {
  role: "artist" | "director";
  content: string;
  evidenceIds?: string[];
};

function messageFrom(error: unknown, data: any) {
  if (data?.error?.message) return String(data.error.message);
  if (error && typeof error === "object" && "message" in error) return String((error as { message: string }).message);
  return "The AI Director request failed. Please retry.";
}

export function useDirectorChat(song: Song | null, confirmed: SongInterpretationDraft | null) {
  const [messages, setMessages] = useState<DirectorMessage[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const gated = Boolean(
    song?.current_interpretation_id &&
    song.interpretation_confirmed_at &&
    confirmed?.id === song.current_interpretation_id &&
    confirmed.status === "confirmed"
  );

  useEffect(() => {
    setMessages([]);
    setError(null);
    setBlocked(false);
  }, [song?.id, confirmed?.id]);

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!song || !gated || !trimmed || working) return null;
    setWorking(true);
    setError(null);
    setBlocked(false);
    setMessages((current) => [...current, { role: "artist", content: trimmed }]);
    const { data, error: invokeError } = await supabase.functions.invoke("beatvision-ai-director", {
      body: { projectId: song.project_id, songId: song.id, question: trimmed },
    });
    if (invokeError || data?.error) {
      const message = messageFrom(invokeError, data);
      setError(message);
      setBlocked(Boolean(data?.error?.code === "PROVIDER_COST_UNVERIFIED") || message.includes("no-charge provider"));
      setWorking(false);
      return null;
    }
    const answer = typeof data?.answer === "string" ? data.answer : "The AI Director returned no answer.";
    setMessages((current) => [...current, { role: "director", content: answer, evidenceIds: Array.isArray(data?.evidence_ids) ? data.evidence_ids : [] }]);
    setWorking(false);
    return answer;
  }, [gated, song, working]);

  return { messages, working, error, blocked, gated, ask };
}
