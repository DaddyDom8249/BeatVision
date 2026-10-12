import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase/client";
import { formatFailure } from "../lib/errorDetails";
import { capture } from "../lib/analytics";
import StudioHeader from "../components/navigation/StudioHeader";

interface Props {
  onNavigate: (path: string) => void;
}

export default function CreateProjectPage({ onNavigate }: Props) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openAccountFlow() {
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      onNavigate("/");
      return;
    }
    onNavigate("/auth?next=/projects/new");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setError("Sign-in is required before a project can be created.");
      setSaving(false);
      return;
    }
    const { data, error } = await supabase
      .from("projects")
      .insert({ owner_id: auth.user.id, title: title.trim(), status: "Draft", stage: "song" })
      .select("id")
      .single();
    if (error) {
      capture("project_creation_failed");
      setError(formatFailure("Create project", error, { status: "Draft", stage: "song", title: title.trim() }));
    } else {
      capture("project_created", { stage: "song" });
      onNavigate(`/projects/${data.id}/song`);
    }
    setSaving(false);
  }

  return (
    <div className="app-shell">
      <StudioHeader onNavigate={onNavigate} />

      <main className="dashboard create-page">
        <section className="create-card">
          <div className="eyebrow">NEW CREATIVE PROJECT</div>
          <h1>Start with the song.</h1>
          <p>
            Give your project a working title. The song audio and artistic intent will become the foundational source material for the visual world.
          </p>
          <div className="auth-prompt">
            <span>Studio account required to save project data.</span>
            <button type="button" className="auth-link" onClick={openAccountFlow}>
              Sign in or create an account →
            </button>
          </div>
          <form onSubmit={submit}>
            <label>
              Project Working Title
              <input
                autoFocus
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Midnight Horizon"
              />
            </label>
            <button className="primary-button large" disabled={saving}>
              {saving ? "Initializing Project…" : "Create Project & Intake Song →"}
            </button>
          </form>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      </main>
    </div>
  );
}
