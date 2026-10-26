import { inspectMotionDirection } from "../../supabase/functions/beatvision-generation/shot-direction";
import BeginnerShotHelp from "../components/plan/BeginnerShotHelp";
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
  onSave: (id: string, changes: Partial<Pick<VisualPlanScene, "start_time" | "end_time" | "title" | "visual_direction" | "camera_direction" | "movement_direction" | "location" | "mood" | "lyric_moment" | "transition_style" | "continuity_notes">>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(scene);
  const request = inspectMotionDirection({...draft});
  const dirty = draft.start_time !== scene.start_time || draft.end_time !== scene.end_time || draft.title !== scene.title ||
    draft.visual_direction !== scene.visual_direction ||
    draft.camera_direction !== scene.camera_direction ||
    draft.movement_direction !== scene.movement_direction ||
    draft.location !== scene.location ||
    draft.mood !== scene.mood ||
    draft.lyric_moment !== scene.lyric_moment ||
    draft.transition_style !== scene.transition_style ||
    draft.continuity_notes !== scene.continuity_notes;

  function set(key: keyof typeof draft, value: string | number) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <article className="visual-plan-scene">
      <header>
        <div>
          <span className="eyebrow">SCENE {String(scene.scene_number).padStart(2, "0")}</span>
          <h2>{formatTime(scene.start_time)} — {formatTime(scene.end_time)}</h2>
        </div>
        <span>{scene.status === "approved" ? "Locked" : "Draft"}</span>
      </header>
      <div className="visual-plan-grid">
        <label>Start time (seconds)<input type="number" step="0.01" min="0" value={draft.start_time} disabled={working} onChange={e => set("start_time", Number(e.target.value))} /></label>
        <label>End time (seconds)<input type="number" step="0.01" min="0" value={draft.end_time} disabled={working} onChange={e => set("end_time", Number(e.target.value))} /></label>
        <label>Scene title<input value={draft.title} disabled={working} onChange={(e) => set("title", e.target.value)} /></label>
        <label>Location<input value={draft.location} disabled={working} onChange={(e) => set("location", e.target.value)} /></label>
        <label>Mood<input value={draft.mood} disabled={working} onChange={(e) => set("mood", e.target.value)} /></label>
        <label>Lyric / musical moment<input value={draft.lyric_moment} disabled={working} onChange={(e) => set("lyric_moment", e.target.value)} /></label>
        <label>Visual direction<textarea rows={4} value={draft.visual_direction} disabled={working} onChange={(e) => set("visual_direction", e.target.value)} /></label>
        <label>Camera direction<textarea rows={4} value={draft.camera_direction} disabled={working} onChange={(e) => set("camera_direction", e.target.value)} /></label>
        <label>Movement direction<textarea rows={4} value={draft.movement_direction} disabled={working} onChange={(e) => set("movement_direction", e.target.value)} /></label>
        <label>Transition<textarea rows={3} value={draft.transition_style} disabled={working} onChange={(e) => set("transition_style", e.target.value)} /></label>
        <label>Continuity notes<textarea rows={4} value={draft.continuity_notes} disabled={working} onChange={(e) => set("continuity_notes", e.target.value)} /></label>
      </div>
      <aside aria-label={`Scene ${scene.scene_number} motion request preview`}>
        <h3>Motion request preview</h3>
        {request.issue ? <p className="form-error">{request.issue}</p> : <p style={{whiteSpace:"pre-wrap"}}>{request.prompt}</p>}
        <p>Updates from your edits before saving. This checks direction only. Source approval and provider limits are checked before submission; generated video still needs review.</p>
      </aside>
      {scene.status === "draft" && (
        <button className="secondary-button" disabled={working || !dirty} onClick={() => void onSave(scene.id, {
          start_time: draft.start_time, end_time: draft.end_time,
          title: draft.title.trim(),
          visual_direction: draft.visual_direction.trim(),
          camera_direction: draft.camera_direction.trim(),
          movement_direction: draft.movement_direction.trim(),
          location: draft.location.trim(),
          mood: draft.mood.trim(),
          lyric_moment: draft.lyric_moment.trim(),
          transition_style: draft.transition_style.trim(),
          continuity_notes: draft.continuity_notes.trim(),
        }).catch(() => undefined)}>
          {working ? "Saving…" : dirty ? "Save Scene Direction" : "Saved"}
        </button>
      )}
    </article>
  );
}

export default function VisualPlanPage({ projectId }: { projectId: string }) {
  const { world, styleBible, song, plan, planHistory, scenes, loading, working, error, createPlan, revisePlan, saveScene, approvePlan, reload } = useVisualPlan(projectId);

  if (loading) return <div className="app-shell"><StudioHeader projectId={projectId} activeStage="visual-plan" /><main className="dashboard"><p>Loading Visual Plan…</p></main></div>;

  const prerequisitesReady =
    Boolean(world?.status === "completed" && world.confirmed_at) &&
    Boolean(styleBible?.status === "approved" && styleBible.approved_at) &&
    Boolean(song?.analysis_status === "completed" && song.analysis);

  if (!prerequisitesReady) {
    return (
      <div className="app-shell">
      <StudioHeader projectId={projectId} activeStage="visual-plan" />
      <main className="dashboard">
        <h1>Visual Plan</h1>
        <p>Phase 4 begins only after the current Visual World Report is confirmed and the Style Bible is locked.</p>
        {error && <p role="alert">{error}</p>}
        <ul>
          <li>Visual World: {world?.confirmed_at ? "Confirmed" : "Not confirmed"}</li>
          <li>Style Bible: {styleBible?.approved_at ? "Locked" : "Not locked"}</li>
          <li>Song analysis: {song?.analysis_status === "completed" ? "Completed" : "Not completed"}</li>
        </ul>
        <a href={`/projects/${projectId}/style`}>Return to Style Bible</a>
      </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
    <StudioHeader projectId={projectId} projectTitle={plan?.title} planId={plan?.id} activeStage="visual-plan" />
    <main className="dashboard">
      <header className="style-header">
        <div>
        <span className="eyebrow">PHASE 4 / VISUAL PLAN</span>
        <h1>Direct the Visual Plan</h1>
        <p>Translate the locked World and Style Bible into a scene-by-scene production plan.</p>
        </div>
      </header>

      {planHistory.length > 1 && <nav aria-label="Plan revisions">{planHistory.map(saved => <a key={saved.id} className="secondary-button" href={`/projects/${projectId}/visual-plan?plan=${saved.id}`}>Revision {saved.revision_number} · {saved.status}</a>)}</nav>}
      {error && <div role="alert"><p>{error}</p><a href={`/projects/${projectId}/style`}>Return to Style Bible</a></div>}

      {!plan ? (
        <section className="create-card">
          <h2>Build Visual Plan</h2>
          <p>{song?.analysis?.sections?.length ?? 0} analyzed song sections are available as the initial timing structure.</p>
          <button className="primary-button" disabled={working} onClick={() => void createPlan().catch(() => undefined)}>
            {working ? "Building…" : "Build Visual Plan from Song"}
          </button>
        </section>
      ) : (
        <>
          <section className="style-section">
            <div>
              <span className="eyebrow">PLAN STATUS</span>
              <h2>{plan.title} · Revision {plan.revision_number ?? 1}</h2>
              <p>{plan.status === "approved" ? "Visual Plan locked. Production must follow this approved direction." : "Draft. Edit the scene directions, then lock the plan."}</p>
            </div>
            {plan.status === "approved" && plan.id === planHistory[0]?.id && <button className="secondary-button" disabled={working} onClick={() => void revisePlan().catch(() => undefined)}>Create Editable Revision</button>}
            {plan.status === "draft" && (
              <button className="primary-button" disabled={working || scenes.length === 0} onClick={() => void approvePlan().catch(() => undefined)}>
                {working ? "Locking…" : "Lock Visual Plan"}
              </button>
            )}
          </section>

          {plan.id === planHistory[0]?.id && scenes.some(scene => scene.end_time - scene.start_time > 5) && (
            <section className="style-section">
              <div>
                <h2>Prepare full-song motion</h2>
                <p>Cover the full {formatTime(Number(plan.duration_seconds))} song with shots up to 5 seconds each. This creates a new draft using saved directions; save your edits first.</p>
                <p>Review and lock the new plan, then generate and approve an image and motion clip for each shot. Generation uses your available credits. Assembly requires real footage for every shot.</p>
              </div>
              <button className="secondary-button" disabled={working} onClick={() => void revisePlan(5).catch(() => undefined)}>
                {working ? "Preparing shots…" : "Create 5-second shot revision"}
              </button>
            </section>
          )}

          <BeginnerShotHelp key={plan.id} planId={plan.id} locked={plan.status === "approved"} scenes={scenes} working={working}
            onCreateRevision={()=>revisePlan()} onSaved={reload} />
          <section>
            <h2>Timeline</h2>
            {scenes.map((scene) => (
              <SceneEditor key={scene.id} scene={scene} working={working || plan.status === "approved"} onSave={saveScene} />
            ))}
          </section>

          {plan.status === "approved" && (
            <section>
              <h2>Phase 4 Complete</h2>
              <p>The Visual Plan is locked and ready for the next production stage.</p>
              <a className="primary-button" href={`/projects/${projectId}/scenes?plan=${plan.id}`}>Continue to Scene Production</a>
            </section>
          )}
        </>
      )}
    </main>
    </div>
  );
}
