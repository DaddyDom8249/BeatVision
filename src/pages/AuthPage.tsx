import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase/client";
import { capture } from "../lib/analytics";

interface Props { onNavigate: (path: string) => void; }

export default function AuthPage({ onNavigate }: Props) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const result = mode === "sign-in"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });

    if (result.error) {
      capture("auth_failed", { mode });
      setError(result.error.message);
    } else if (mode === "sign-up" && !result.data.session) {
      setMessage("Account created. Check your email to confirm your account, then sign in.");
    } else {
      capture(mode === "sign-in" ? "signed_in" : "signed_up");
      onNavigate("/projects/new");
    }

    setSaving(false);
  }

  return (
    <div className="app-shell">
      <main className="dashboard auth-page">
        <button className="brand" onClick={() => onNavigate("/")}>BEAT<span>VISION</span></button>
        <section className="auth-card">
          <div className="eyebrow">{mode === "sign-in" ? "SIGN IN" : "CREATE ACCOUNT"}</div>
          <h1>{mode === "sign-in" ? "Enter the studio." : "Create your account."}</h1>
          <p>{mode === "sign-in"
            ? "Sign in to create projects and keep your creative work tied to your account."
            : "Create a free BeatVision account to start a project."}</p>

          <form onSubmit={submit}>
            <label>Email<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
            <label>Password<input required type="password" minLength={6} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" /></label>
            <button className="primary-button large" disabled={saving}>
              {saving ? "Working…" : mode === "sign-in" ? "Sign in →" : "Create account →"}
            </button>
          </form>

          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-message" role="status">{message}</p>}

          <button className="auth-switch" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setError(null); setMessage(null); }}>
            {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>
        </section>
      </main>
    </div>
  );
}
