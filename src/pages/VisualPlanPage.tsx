import { useState } from "react";
import { useVisualPlan } from "../hooks/useVisualPlan";
import type { VisualPlanScene } from "../types/visualPlan";
import StudioHeader from "../components/navigation/StudioHeader";

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function SceneEditor({ scene, working, onSave }: {
  scene: VisualPlanScene;
  working: boolean;
  onSave: (id: string, changes: Partial<Pick<VisualPlanScene, "title" | "visual_direction" | "camera_direction" | "movement_direction" | "location" | "mood" | "lyric_moment" | "transition_style" | "continuity_notes">>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(scene);
  const dirty = draft.title !== scene.title ||
    draft.visual_direction !== scene.visual_direction ||
    draft.camera_direction !== scene.camera_direction ||
    draft.movement_direction !== scene.movement_direction ||
    draft.location !== scene.location ||
    draft.mood !== scene.mood ||
    draft.lyric_moment !== scene.lyric_moment ||
    draft.transition_style !== scene.transition_style ||
    draft.continuity_notes !== scene.continuity_notes;

  function set(key: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <article className="visual-plan-scene">
      <header>
        <div>
          <span className="eyebrow">SCENE {String(scene.scene_number).padStart(2, "0")}</span>
          <h2 style={{ fontSize: "20px", color: "#ffffff", margin: "4px 0" }}>{formatTime(scene.start_time)} — {formatTime(scene.end_time)}</h2>
        </div>
        <span className={`status-badge ${scene.status === "approved" ? "status-approved" : "status-draft"}`}>
          {scene.status === "approved" ? "LOCKED" : "DRAFT"}
        </span>
      </header>

      <div className="visual-plan-grid" style={{ marginTop: "16px" }}>
        <label>Scene Title <input value={draft.title} disabled={working} onChange={(e) => set("title", e.target.value)} /></label>
        <label>Location <input value={draft.location} disabled={working} onChange={(e) => set("location", e.target.value)} /></label>
        <label>Mood <input value={draft.mood} disabled={working} onChange={(e) => set("mood", e.target.value)} /></label>
        <label>Lyric / Musical Moment <input value={draft.lyric_moment} disabled={working} onChange={(e) => set("lyric_moment", e.target.value)} /></label>
        <label>Visual Direction <textarea rows={4} value={draft.visual_direction} disabled={working} onChange={(e) => set("visual_direction", e.target.value)} /></label>
        <label>Camera Direction <textarea rows={4} value={draft.camera_direction} disabled={working} onChange={(e) => set("camera_direction", e.target.value)} /></label>
        <label>Movement Direction <textarea rows={4} value={draft.movement_direction} disabled={working} onChange={(e) => set("movement_direction", e.target.value)} /></label>
        <label>Transition <textarea rows={3} value={draft.transition_style} disabled={working} onChange={(e) => set("transition_style", e.target.value)} /></label>
        <label>Continuity Notes <textarea rows={4} value={draft.continuity_notes} disabled={working} onChange={(e) => set("continuity_notes", e.target.value)} /></label>
      </div>

      {scene.status === "draft" && (
        <button
          className="secondary-button"
          style={{ marginTop: "16px" }}
          disabled={working || !dirty}
          onClick={() => void onSave(scene.id, {
            title: draft.title.trim(),
            visual_direction: draft.visual_direction.trim(),
            camera_direction: draft.camera_direction.trim(),
            movement_direction: draft.movement_direction.trim(),
            location: draft.location.trim(),
            mood: draft.mood.trim(),
            lyric_moment: draft.lyric_moment.trim(),
            transition_style: draft.transition_style.trim(),
            continuity_notes: draft.continuity_notes.trim(),
          }).catch(() => undefined)}
        >
          {working ? "Saving…" : dirty ? "Save Scene Direction" : "Saved ✓"}
        </button>
      )}
    </article>
  );
}

export default function VisualPlanPage({ projectId }: { projectId: string }) {
  const { world, styleBible, song, plan, scenes, loading, working, error, createPlan, saveScene, approvePlan } = useVisualPlan(projectId);

  if (loading) {
    return (
      <div className="app-shell">
        <StudioHeader projectId={projectId} activeStage="visual-plan" />
        <main className="dashboard"><p>Loading Visual Plan…</p></main>
      </div>
    );
  }

  const prerequisitesReady =
    Boolean(world?.status === "completed" && world.confirmed_at) &&
    Boolean(styleBible?.status === "approved" && styleBible.approved_at) &&
    Boolean(song?.analysis_status === "completed" && song.analysis);

  if (!prerequisitesReady) {
    return (
      <div className="app-shell">
        <StudioHeader projectId={projectId} activeStage="visual-plan" />
        <main className="dashboard">
          <div className="eyebrow">04 / VISUAL PLAN</div>
          <h1>Visual Plan Prerequisites Required</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "20px" }}>
            Phase 4 begins only after the current Visual World Report is confirmed and the Style Bible is locked.
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="style-section" style={{ marginTop: "20px" }}>
            <ul style={{ display: "grid", gap: "10px", listStyle: "none", padding: 0, fontSize: "14px" }}>
              <li>Visual World: {world?.confirmed_at ? "✓ Confirmed" : "✗ Not confirmed"}</li>
              <li>Style Bible: {styleBible?.approved_at ? "✓ Locked" : "✗ Not locked"}</li>
              <li>Song Analysis: {song?.analysis_status === "completed" ? "✓ Completed" : "✗ Not completed"}</li>
            </ul>
          </div>
          <button className="primary-button" style={{ marginTop: "20px" }} onClick={() => { window.location.href = `/projects/${projectId}/style`; }}>
            Return to Style Bible →
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <StudioHeader
        projectId={projectId}
        activeStage="visual-plan"
        statusBadge={plan?.status === "approved" ? "PLAN LOCKED" : "DRAFT"}
      />

      <main className="dashboard" style={{ maxWidth: "1200px" }}>
        <header className="style-header">
          <div>
            <span className="eyebrow">04 / VISUAL PLAN & TIMELINE</span>
            <h1>Direct the Visual Plan</h1>
            <p>Translate the locked World and Style Bible into a scene-by-scene timing and production plan.</p>
          </div>
          {plan && (
            <span className={`status-badge ${plan.status === "approved" ? "status-approved" : "status-draft"}`}>
              {plan.status === "approved" ? "PLAN LOCKED" : "DRAFT MODE"}
            </span>
          )}
        </header>

        {error && <div className="form-error" role="alert" style={{ marginBottom: "20px" }}>{error}</div>}

        {!plan ? (
          <section className="create-card">
            <div className="eyebrow">BUILD VISUAL PLAN</div>
            <h2>Generate Initial Scene Timeline</h2>
            <p style={{ color: "var(--text-muted)", margin: "8px 0 20px" }}>
              {song?.analysis?.sections?.length ?? 0} analyzed song sections will form the initial timeline structure.
            </p>
            <button className="primary-button large" disabled={working} onClick={() => void createPlan().catch(() => undefined)}>
              {working ? "Building Visual Plan…" : "Build Visual Plan from Song →"}
            </button>
          </section>
        ) : (
          <>
            <section className="style-section" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <span className="eyebrow">PLAN TITLE</span>
                <h2 style={{ fontSize: "24px", color: "#ffffff", margin: "4px 0" }}>{plan.title}</h2>
                <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                  {plan.status === "approved"
                    ? "Visual Plan locked. Production brief and workspace are available."
                    : "Draft mode. Refine individual scene directions, then lock the plan."}
                </p>
              </div>
              {plan.status === "draft" && (
                <button className="primary-button large" disabled={working || scenes.length === 0} onClick={() => void approvePlan().catch(() => undefined)}>
                  {working ? "Locking Plan…" : "Lock Visual Plan ✓"}
                </button>
              )}
            </section>

            <section style={{ marginTop: "28px" }}>
              <div className="eyebrow">SCENE TIMELINE ({scenes.length})</div>
              {scenes.map((scene) => (
                <SceneEditor key={scene.id} scene={scene} working={working || plan.status === "approved"} onSave={saveScene} />
              ))}
            </section>

            {plan.status === "approved" && (
              <section className="production-handoff" style={{ marginTop: "32px" }}>
                <div>
                  <span className="eyebrow">PHASE 4 COMPLETE</span>
                  <h2>Visual Plan is Locked</h2>
                  <p>The scene-by-scene timing is locked. Proceed to Scene Production briefs.</p>
                </div>
                <a className="primary-button large" href={`/projects/${projectId}/scenes`}>
                  Continue to Scene Production Briefs →
                </a>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
