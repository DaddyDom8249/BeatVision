import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { Project } from "../types/project";

export function useProject(projectId?: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from("projects")
      .select("id,user_id,title,status,created_at,updated_at")
      .eq("id", projectId).single();
    if (error) { setError(error.message); setProject(null); }
    else setProject(data as Project);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);
  return { project, loading, error, reload: load };
}
