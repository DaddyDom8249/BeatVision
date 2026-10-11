import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase/client";
import { getCreativeErrorMessage } from "../lib/formatCreativeText";
import type { Project } from "../types/project";

export function useProject(projectId?: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    const isCurrent = () => version === requestVersion.current;
    if (!projectId) {
      setProject(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.from("projects")
        .select("id,owner_id,title,status,song_duration,created_at,updated_at")
        .eq("id", projectId).single();
      if (!isCurrent()) return;
      if (error) {
        setError(error.message);
        setProject(null);
      } else if (!data) {
        setProject(null);
      } else {
        setProject(data as Project);
      }
    } catch (error) {
      if (!isCurrent()) return;
      setError(getCreativeErrorMessage(error, "Unable to load project."));
      setProject(null);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setProject(null);
    setError(null);
    setLoading(Boolean(projectId));
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);

  return { project, loading, error, reload: load };
}
