import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase/client";
import { formatFailure } from "../lib/errorDetails";
import { capture } from "../lib/analytics";

interface Props { onNavigate: (path: string) => void; }

export default function CreateProjectPage({ onNavigate }: Props) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (active && !authError) setSignedIn(Boolean(data.user));
    }).catch(() => { /* Submit and sign-in actions retain explicit error handling. */ });
    return () => { active = false; };
  }, []);

  async function openAccountFlow() {
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (auth.user) {
        // Already authenticated: stay on the form instead of returning home.
        setSignedIn(true);
        return;
      }
      onNavigate("/auth?next=/projects/new");
    } catch (cause) {
      setError(formatFailure("Check account", cause));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) {
        setSignedIn(false);
        setError("Sign-in is required before a project can be created.");
        return;
      }
      setSignedIn(true);
      const { data, error: saveError } = await supabase.from("projects")
        .insert({ owner_id: auth.user.id, title: title.trim(), status: "Draft", stage: "song" })
        .select("id").single();
      if (saveError) throw saveError;
      capture("project_created", { stage: "song" });
      onNavigate(`/projects/${data.id}/song`);
    } catch (error) {
      capture("project_creation_failed");
      setError(formatFailure("Create project", error, { status: "Draft", stage: "song", title: title.trim() }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <main className="dashboard create-page">
        <button className="brand" onClick={() => onNavigate("/")}>BEAT<span>VISION</span></button>
        <section className="create-card">
          <div className="eyebrow">NEW PROJECT</div>
          <h1>Start with the song.</h1>
          <p>Give the project a working name. The song, not the prompt, becomes the source material for the visual world.</p>
          {!signedIn && <div className="auth-prompt">
            <span>Account required to save your project.</span>
            <button type="button" className="auth-link" onClick={() => void openAccountFlow()}>Sign in or create an account →</button>
          </div>}
          <form onSubmit={submit}>
            <label>Project name<input autoFocus required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Midnight" /></label>
            <button className="primary-button large" disabled={saving}>{saving ? "Creating…" : "Create project →"}</button>
          </form>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      </main>
    </div>
  );
}
