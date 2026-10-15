import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import { getCreativeErrorMessage } from "../lib/formatCreativeText";
import StudioHeader from "../components/navigation/StudioHeader";

interface Props { onNavigate: (path: string) => void; }

type Project = { id: string; title: string; status: string; updated_at: string };

export default function DashboardPage({ onNavigate }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    (async () => {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (active) setSignedIn(Boolean(auth.user));
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
      <StudioHeader onNavigate={onNavigate} />

      <main className="dashboard">
        <header className="dashboard-heading">
          <div>
            <div className="eyebrow">YOUR CREATIVE STUDIO</div>
            <h1>BEATVISION</h1>
          </div>
          <div className="hero-actions" style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <button className="primary-button large" onClick={() => onNavigate("/projects/new")}>
              Start New Project <span>→</span>
            </button>
            {!signedIn && <button className="secondary-button" onClick={() => onNavigate("/auth")}>
              Studio Sign In
            </button>}
          </div>
        </header>

        <section className="dashboard-stats-bar">
          <div className="stat-item">
            <span className="stat-label">Recent Projects</span>
            <span className="stat-value">{loading ? "Loading" : error ? "Unavailable" : projects.length}</span>
          </div>
        </section>

        <section className="projects-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">YOUR CREATIVE STUDIO</div>
              <h2>Recent Projects</h2>
            </div>
            {projects.length > 0 && (
              <button className="secondary-button" onClick={() => onNavigate("/projects/new")}>
                + New Project
              </button>
            )}
          </div>

          {loading ? (
            <div className="empty-state">
              <p>Loading your studio projects…</p>
            </div>
          ) : error ? (
            <div className="empty-state">
              <p className="form-error" role="alert">{error}</p>
              <button className="secondary-button" onClick={() => setRefreshCount(value => value + 1)}>Retry loading projects</button>
            </div>
          ) : projects.length === 0 ? (
            <div className="empty-state">
              <div className="empty-mark">❖</div>
              <h3>Your first visual world starts with a song.</h3>
              <p>Upload a track, define what matters, and let BeatVision reveal the visual foundation for your video.</p>
              <button className="primary-button" onClick={() => onNavigate("/projects/new")}>
                Create Your First Project →
              </button>
            </div>
          ) : (
            <div className="project-grid">
              {projects.map((project) => (
                <button
                  key={project.id}
                  className="project-card"
                  onClick={() => onNavigate(`/projects/${project.id}/song`)}
                  type="button"
                >
                  <div className="project-art">
                    <span>BV</span>
                  </div>
                  <div className="project-card-body">
                    <div className="project-card-header">
                      <span className="project-status-pill">{project.status}</span>
                    </div>
                    <h3>{project.title}</h3>
                    <div className="project-card-footer">
                      <span>
                        Updated {new Date(project.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                      <small>Open Studio →</small>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
