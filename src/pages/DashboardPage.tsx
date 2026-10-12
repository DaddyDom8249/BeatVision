import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import StudioHeader from "../components/navigation/StudioHeader";

interface Props {
  onNavigate: (path: string) => void;
}

type Project = { id: string; title: string; status: string; updated_at: string };

export default function DashboardPage({ onNavigate }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (active) setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("projects")
        .select("id,title,status,updated_at")
        .eq("owner_id", auth.user.id)
        .order("updated_at", { ascending: false })
        .limit(12);
      if (active) {
        setProjects((data ?? []) as Project[]);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="app-shell">
      <StudioHeader onNavigate={onNavigate} />

      <main className="dashboard">
        <section className="hero">
          <div className="eyebrow">CREATIVE VIDEO SYSTEM FOR ARTISTS & DIRECTORS</div>
          <h1>
            Every song has a world.<br />
            <em>Reveal it.</em>
          </h1>
          <p>
            BeatVision transforms musical intent into a persistent visual world. Direct characters, environments, visual rules, and motion with total continuity.
          </p>
          <div className="hero-actions" style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <button className="primary-button large" onClick={() => onNavigate("/projects/new")}>
              Start New Project <span>→</span>
            </button>
            <button className="secondary-button" onClick={() => onNavigate("/auth")}>
              Studio Sign In
            </button>
          </div>
        </section>

        <section className="dashboard-stats-bar">
          <div className="stat-item">
            <span className="stat-label">Active Workflow</span>
            <span className="stat-value">Song → World → Motion</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Creative Control</span>
            <span className="stat-value">Artist Directed</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Continuity Guard</span>
            <span className="stat-value">Vision Lock Active</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Total Projects</span>
            <span className="stat-value">{projects.length} Worlds</span>
          </div>
        </section>

        <section className="principles">
          <article>
            <strong>01 / REVEAL</strong>
            <h3>Understand the Song</h3>
            <p>
              Extract BPM, musical key, structure, and emotional resonance before generating visuals. Intent becomes durable creative direction.
            </p>
          </article>
          <article>
            <strong>02 / DIRECT</strong>
            <h3>Shape the World</h3>
            <p>
              Define visual rules, characters, and spaces directly. AI proposes creative options; the artist approves and locks decisions.
            </p>
          </article>
          <article>
            <strong>03 / LOCK</strong>
            <h3>Preserve Continuity</h3>
            <p>
              Protect approved character wardrobe, environment lighting, and camera rules from shifting across scene generations.
            </p>
          </article>
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
