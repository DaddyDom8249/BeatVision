import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { WorldReport } from "../types/world";
import { formatFailure, formatHttpFailure } from "../lib/errorDetails";

const endpoint = () => `${import.meta.env.VITE_SUPABASE_URL || "https://mdofsinyofqbeapzfygu.supabase.co"}/functions/v1/beatvision-world`;
const publishableKey = () => import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

export function useWorld(projectId: string) {
  const [report, setReport] = useState<WorldReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const request = useCallback(async (method: "GET" | "POST" | "PATCH", body: unknown | undefined, version: number) => {
    const { data: sessionData } = await supabase.auth.getSession();
    let session = sessionData.session;
    if (!session?.access_token) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session;
    }
    if (!session?.access_token) throw new Error("You must be signed in.");

    const url = method === "GET" ? `${endpoint()}?projectId=${encodeURIComponent(projectId)}` : endpoint();
    const key = publishableKey();
    if (!key) throw new Error("Supabase publishable key is not configured.");
    const headers: Record<string, string> = {
      apikey: key,
      Authorization: `Bearer ${session.access_token}`,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (error) {
      throw new Error(formatFailure("World service network request", error, { method, projectId, endpoint: url }));
    }

    const text = await res.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }

    if (!res.ok) {
      if (payload.report && mounted.current && version === requestVersion.current) setReport(payload.report);
      throw new Error(formatHttpFailure("World " + method + " request", res, text));
    }
    return { report: payload.report as WorldReport | null, version };
  }, [projectId]);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const result = await request("GET", undefined, version);
      if (mounted.current && result.version === requestVersion.current) setReport(result.report);
    } catch (e) {
      if (mounted.current && version === requestVersion.current) setError(formatFailure("Load World report", e, { projectId }));
    } finally {
      if (mounted.current && version === requestVersion.current) setLoading(false);
    }
  }, [projectId, request]);

  useEffect(() => {
    void load();
  }, [load]);

  const revealWorld = useCallback(async () => {
    if (generating || saving || confirming) return;
    setGenerating(true);
    setError(null);
    try {
      const version = ++requestVersion.current;
      const result = await request("POST", { projectId }, version);
      if (mounted.current && result.version === requestVersion.current) setReport(result.report);
    } catch (e) {
      if (mounted.current) setError(formatFailure("Reveal World", e, { projectId }));
    } finally {
      if (mounted.current) setGenerating(false);
    }
  }, [confirming, generating, projectId, request, saving]);

  const saveWorld = useCallback(async (changes: Record<string, unknown>) => {
    if (saving || confirming || generating) return;
    setSaving(true);
    setError(null);
    try {
      const version = ++requestVersion.current;
      const result = await request("PATCH", { projectId, action: "save_edits", changes }, version);
      if (mounted.current && result.version === requestVersion.current) setReport(result.report);
    } catch (e) {
      const message = formatFailure("Save World changes", e, { projectId, action: "save_edits" });
      if (mounted.current) setError(message);
      throw new Error(message);
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [confirming, generating, projectId, request, saving]);

  const confirmWorld = useCallback(async () => {
    if (confirming || saving || generating) return;
    setConfirming(true);
    setError(null);
    try {
      const version = ++requestVersion.current;
      const result = await request("PATCH", { projectId, action: "confirm" }, version);
      if (mounted.current && result.version === requestVersion.current) setReport(result.report);
    } catch (e) {
      if (mounted.current) setError(formatFailure("Confirm World", e, { projectId, action: "confirm" }));
    } finally {
      if (mounted.current) setConfirming(false);
    }
  }, [confirming, generating, projectId, request, saving]);

  return {
    report, loading, generating, saving, confirming, error,
    revealWorld, saveWorld, confirmWorld, reload: load,
  };
}
