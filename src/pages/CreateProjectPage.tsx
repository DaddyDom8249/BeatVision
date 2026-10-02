import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase/client";

interface Props { onNavigate: (path: string) => void; }

export default function CreateProjectPage({ onNavigate }: Props) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setError("Sign-in is required before a project can be created.");
      setSaving(false);
      return;
    }
    const { data, error } = await supabase.from("projects")
      .insert({ owner_id: auth.user.id, title: title.trim(), status: "Draft", stage: "song" })
      .select("id").single();
    if (error) setError(error.message);
    else onNavigate(`/projects/${data.id}/song`);
    setSaving(false);
  }

  return (
    <div className="app-shell">
      <main className="dashboard create-page">
        <button className="brand" onClick={() => onNavigate("/")}>BEAT<span>VISION</span></button>
        <section className="create-card">
          <div className="eyebrow">NEW PROJECT</div>
          <h1>Start with the song.</h1>
          <p>Give the project a working name. The song, not the prompt, becomes the source material for the visual world.</p>
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
