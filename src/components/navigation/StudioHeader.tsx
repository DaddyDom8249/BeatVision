import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase/client";

export type StageId = "song" | "world" | "style" | "visual-plan" | "scenes" | "production";

export interface StudioHeaderProps {
  projectId?: string;
  projectTitle?: string;
  planId?: string;
  activeStage?: StageId;
  statusBadge?: string;
  onNavigate?: (path: string) => void;
}

const STAGES: { id: StageId; number: string; label: string; path: (id: string) => string }[] = [
  { id: "song", number: "01", label: "Song", path: (id) => `/projects/${id}/song` },
  { id: "world", number: "02", label: "World", path: (id) => `/projects/${id}/world` },
  { id: "style", number: "03", label: "Style", path: (id) => `/projects/${id}/style` },
  { id: "visual-plan", number: "04", label: "Plan", path: (id) => `/projects/${id}/visual-plan` },
  { id: "scenes", number: "05", label: "Briefs", path: (id) => `/projects/${id}/scenes` },
  { id: "production", number: "06", label: "Workspace", path: (id) => `/projects/${id}/production` },
];

export default function StudioHeader({
  projectId,
  projectTitle,
  planId,
  activeStage,
  statusBadge,
  onNavigate,
}: StudioHeaderProps) {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active && data?.user) {
        setUserEmail(data.user.email ?? "Signed in");
      }
    }).catch(() => {
      if (active) setUserEmail(null);
    });
    return () => {
      active = false;
    };
  }, []);

  function handleNav(path: string) {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.location.href = path;
    }
  }

  function handleStageNav(stage: (typeof STAGES)[number]) {
    const destination = new URL(stage.path(projectId!), window.location.origin);
    const selectedPlan = planId ?? new URLSearchParams(window.location.search).get("plan");
    if (selectedPlan && ["visual-plan", "scenes", "production"].includes(stage.id)) {
      destination.searchParams.set("plan", selectedPlan);
    }
    handleNav(destination.pathname + destination.search);
  }

  return (
    <header className="studio-topbar">
      <div className="studio-topbar-left">
        <button className="studio-brand" onClick={() => handleNav("/")} type="button">
          <span className="brand-text">Beat<span className="brand-accent">Vision</span></span>
        </button>

        {projectTitle && (
          <div className="studio-breadcrumb">
            <span className="breadcrumb-divider">/</span>
            <span className="breadcrumb-title" title={projectTitle}>{projectTitle}</span>
            {statusBadge && <span className="breadcrumb-badge">{statusBadge}</span>}
          </div>
        )}
      </div>

      {projectId && (
        <nav className="studio-pipeline-nav" aria-label="Creative Pipeline Workflow">
          {STAGES.map((s) => {
            const isActive = activeStage === s.id;
            return (
              <button
                key={s.id}
                type="button"
                className={`pipeline-step ${isActive ? "active" : ""}`}
                aria-current={isActive ? "step" : undefined}
                onClick={() => handleStageNav(s)}
              >
                <span className="step-num">{s.number}</span>
                <span className="step-label">{s.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <div className="studio-topbar-right">
        {userEmail ? (
          <div className="studio-user-badge">
            <span className="user-dot" />
            <span className="user-email">{userEmail}</span>
          </div>
        ) : (
          <button className="studio-auth-btn" onClick={() => handleNav("/auth")} type="button">
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}
