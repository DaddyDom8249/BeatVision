import { useState } from "react";
import { useVisualPlan } from "../hooks/useVisualPlan";
import type { VisualPlanScene } from "../types/visualPlan";

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
          <h2>{formatTime(scene.start_time)} — {formatTime(scene.end_time)}</h2>
        </div>
        <span>{scene.status === "approved" ? "Locked" : "Draft"}</span>
      </header>
      <div className="visual-plan-grid">
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
      {scene.status === "draft" && (
        <button className="secondary-button" disabled={working || !dirty} onClick={() => void onSave(scene.id, {
          title: draft.title.trim(),
          visual_direction: draft.visual_direction.trim(),
          camera_direction: draft.camera_direction.trim(),
          movement_direction: draft.movement_direction.trim(),
          location: draft.location.trim(),
          mood: draft.mood.trim(),
          lyric_moment: draft.lyric_moment.trim(),
          transition_style: draft.transition_style.trim(),
          continuity_notes: draft.continuity_notes.trim(),
        })}>
          {working ? "Saving…" : dirty ? "Save Scene Direction" : "Saved"}
        </button>
      )}
    </article>
  );
}

export default function VisualPlanPage({ projectId }: { projectId: string }) {
  const { world, styleBible, song, visionLock, plan, scenes, loading, working, error, createVisionLock, createPlan, saveScene, approvePlan } = useVisualPlan(projectId);

  if (loading) return <main><p>Loading Visual Plan…</p></main>;

  const prerequisitesReady =
    Boolean(world?.status === "completed" && world.confirmed_at) &&
    Boolean(styleBible?.status === "approved" && styleBible.approved_at) &&
    Boolean(song?.analysis_status === "completed" && song.analysis);

  if (!prerequisitesReady) {
    return (
      <main>
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
    );
  }

  return (
    <main>
      <header>
        <span className="eyebrow">PHASE 4 / VISUAL PLAN</span>
        <h1>Direct the song.</h1>
        <p>Translate the locked World and Style Bible into a scene-by-scene production plan.</p>
      </header>

      {error && <p role="alert">{error}</p>}

      <section>
        <div>
          <span className="eyebrow">VISION LOCK</span>
          <h2>{visionLock ? `Locked revision ${visionLock.revision_number}` : "Not locked"}</h2>
          <p>
            {visionLock
              ? "This immutable creative snapshot is the authority inherited by every Scene Direction and generated asset."
              : "Lock the confirmed World, approved Style Bible, song, and approved visual assets before directing scenes."}
          </p>
        </div>
        {!visionLock && (
          <button className="primary-button" disabled={working} onClick={() => void createVisionLock()}>
            {working ? "Locking…" : "Create Vision Lock"}
          </button>
        )}
      </section>

      {!plan ? (
        <section>
          <h2>Build Visual Plan</h2>
          <p>{song?.analysis?.sections?.length ?? 0} analyzed song sections are available as the initial timing structure.</p>
          <button className="primary-button" disabled={working || !visionLock} onClick={() => void createPlan()}>
            {working ? "Building…" : visionLock ? "Build Visual Plan from Song" : "Vision Lock Required"}
          </button>
        </section>
      ) : (
        <>
          <section>
            <div>
              <span className="eyebrow">PLAN STATUS</span>
              <h2>{plan.title}</h2>
              <p>{plan.status === "approved" ? "Visual Plan locked. Production must follow this approved direction." : "Draft. Edit the scene directions, then lock the plan."}</p>
              <p>Vision Lock: {plan.vision_lock_id ? "Bound" : "Missing"}</p>
            </div>
            {plan.status === "draft" && scenes.length === 0 && visionLock && (
              <button className="primary-button" disabled={working} onClick={() => void createPlan()}>
                {working ? "Building…" : "Build Visual Plan from Song"}
              </button>
            )}
            {plan.status === "draft" && scenes.length > 0 && (
              <button className="primary-button" disabled={working || !plan.vision_lock_id} onClick={() => void approvePlan()}>
                {working ? "Locking…" : "Lock Visual Plan"}
              </button>
            )}
          </section>

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
              <a className="primary-button" href={`/projects/${projectId}/scenes`}>Continue to Scene Production</a>
            </section>
          )}
        </>
      )}
    </main>
  );
}
