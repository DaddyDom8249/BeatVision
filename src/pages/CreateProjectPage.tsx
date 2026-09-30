import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase/client";

interface Props { onNavigate: (path: string) => void; }

export default function CreateProjectPage({ onNavigate }: Props) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("You must be signed in to create a project."); setSaving(false); return; }
    const { data, error } = await supabase.from("projects")
      .insert({ user_id: auth.user.id, title: title.trim(), status: "draft" })
      .select("id").single();
    if (error) setError(error.message);
    else onNavigate(`/projects/${data.id}/song`);
    setSaving(false);
  }

  return <main>
    <h1>Create Project</h1>
    <form onSubmit={submit}>
      <label>Project title <input required value={title} onChange={e => setTitle(e.target.value)} /></label>
      <button disabled={saving}>{saving ? "Creating…" : "Create Project"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
  </main>;
}
