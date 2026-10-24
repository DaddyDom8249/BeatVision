import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase/client";
import { capture } from "../lib/analytics";
import StudioHeader from "../components/navigation/StudioHeader";

interface Props {
  onNavigate: (path: string) => void;
}

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
      const next = new URLSearchParams(window.location.search).get("next");
      const destination = next === "/projects/new"
        ? "/projects/new"
        : mode === "sign-in"
          ? "/"
          : "/projects/new";
      onNavigate(destination);
    }

    setSaving(false);
  }

  return (
    <div className="app-shell">
      <StudioHeader onNavigate={onNavigate} />

      <main className="dashboard auth-page">
        <section className="auth-card">
          <div className="eyebrow">{mode === "sign-in" ? "STUDIO ACCESS" : "CREATE ACCOUNT"}</div>
          <h1>{mode === "sign-in" ? "Enter your studio." : "Create your artist account."}</h1>
          <p>
            {mode === "sign-in"
              ? "Sign in to access your projects, locked creative worlds, and visual briefs."
              : "Create a BeatVision account to save projects and direct your visual music videos."}
          </p>
          <p aria-label="Prototype scope">
            BragoraForge (formerly BeatVision) is a development prototype.
            Start with your own audio, review the song interpretation, and approve
            each creative stage before continuing. Short motion generation depends
            on available provider resources; full-song video delivery and singing
            lip sync are still in development.
          </p>

          <form onSubmit={submit}>
            <label>
              Email Address
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                required
                type="password"
                minLength={6}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </label>
            <button className="primary-button large" disabled={saving}>
              {saving ? "Authenticating…" : mode === "sign-in" ? "Sign In to Studio →" : "Create Studio Account →"}
            </button>
          </form>

          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-message" role="status">{message}</p>}

          <button
            type="button"
            className="auth-switch"
            style={{ marginTop: "20px", display: "inline-block" }}
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setError(null);
              setMessage(null);
            }}
          >
            {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>
        </section>
      </main>
    </div>
  );
}
