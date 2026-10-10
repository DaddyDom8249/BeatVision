import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import { getCreativeErrorMessage } from "../lib/formatCreativeText";

interface Props { onNavigate: (path: string) => void; }

type Project = { id: string; title: string; status: string; updated_at: string };

export default function DashboardPage({ onNavigate }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    (async () => {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth.user) { if (active) setProjects([]); return; }
        const { data, error: projectError } = await supabase.from("projects")
          .select("id,title,status,updated_at")
          .eq("owner_id", auth.user.id)
          .order("updated_at", { ascending: false })
          .limit(12);
        if (projectError) throw projectError;
        if (active) setProjects((data ?? []) as Project[]);
      } catch (e) {
        if (active) setError(getCreativeErrorMessage(e, "Unable to load projects."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [refreshCount]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => onNavigate("/")}>BEAT<span>VISION</span></button>
        <div className="topbar-right">
          <span className="status-dot" /> Creative Studio
          <button className="auth-link" onClick={() => onNavigate("/auth")}>Sign in</button>
        </div>
      </header>

      <main className="dashboard">
        <section className="hero">
          <div className="eyebrow">THE CREATIVE ENGINE FOR MUSIC VISUALS</div>
          <h1>Every song has a world.<br /><em>Reveal it.</em></h1>
          <p>BeatVision turns an artist's intent into a visual world they can direct, lock, refine, and bring to life.</p>
          <button className="primary-button large" onClick={() => onNavigate("/auth")}>Start with a song <span>→</span></button>
        </section>

        <section className="principles">
          <article><strong>01</strong><h3>Reveal</h3><p>Understand the song before generating anything. Mood, story, environments, characters, and visual language become durable creative direction.</p></article>
          <article><strong>02</strong><h3>Direct</h3><p>Shape the world yourself. BeatVision gives you controls instead of forcing your vision into one prompt.</p></article>
          <article><strong>03</strong><h3>Lock</h3><p>Protect approved characters, environments, camera rules, and visual motifs from disappearing between generations.</p></article>
        </section>

        <section className="projects-section">
          <div className="section-heading"><div><div className="eyebrow">YOUR STUDIO</div><h2>Projects</h2></div></div>
          {loading ? <div className="empty-state">Loading your worlds…</div> :
            error ? <div className="empty-state"><p className="form-error" role="alert">{error}</p><button className="secondary-button" onClick={() => setRefreshCount(value => value + 1)}>Retry loading projects</button></div> :
            projects.length === 0 ? (
              <div className="empty-state">
                <div className="empty-mark">◌</div>
                <h3>Your first world starts with a song.</h3>
                <p>Upload the track, define what matters, and let BeatVision reveal the visual foundation.</p>
                <button className="secondary-button" onClick={() => onNavigate("/projects/new")}>Create project</button>
              </div>
            ) : (
              <div className="project-grid">
                {projects.map(project => (
                  <button key={project.id} className="project-card" onClick={() => onNavigate(`/projects/${project.id}/song`)}>
                    <div className="project-art"><span>BV</span></div>
                    <div className="project-card-body"><span>{project.status}</span><h3>{project.title}</h3><small>Open studio →</small></div>
                  </button>
                ))}
              </div>
            )}
        </section>
      </main>
    </div>
  );
}
