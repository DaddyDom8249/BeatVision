import { useEffect, useRef, useState } from "react";
import { directionIssues, readSceneDirections } from "../../lib/guidedShotRepair";
import type { VisualPlanScene } from "../../types/visualPlan";

type EditableDirection = Pick<VisualPlanScene, "visual_direction" | "mood" | "movement_direction" | "camera_direction">;
type DirectorDraft = { visual: string; actor: string; camera: string; mood: string };

function draftFromScene(scene: VisualPlanScene): DirectorDraft {
  const direction = readSceneDirections(scene);
  return { visual: scene.visual_direction ?? "", actor: direction.actor, camera: direction.camera, mood: scene.mood ?? "" };
}

// Explicitly preserve timing, lyrics, setting, transitions, continuity and approvals.
// Only user-edited fields are sent to the existing optimistic-concurrency save.
export function directorDirectionPatch(scene: VisualPlanScene, draft: DirectorDraft): Partial<EditableDirection> {
  const before = draftFromScene(scene);
  const patch: Partial<EditableDirection> = {};
  const visual = draft.visual.trim(), actor = draft.actor.trim(), camera = draft.camera.trim(), mood = draft.mood.trim();
  if (visual !== before.visual.trim()) patch.visual_direction = visual;
  if (mood !== before.mood.trim()) patch.mood = mood;
  if (actor !== before.actor.trim() || camera !== before.camera.trim()) {
    const issue = directionIssues({ actor, camera });
    if (issue.actor || issue.camera) throw new Error(issue.actor || issue.camera);
    patch.movement_direction = JSON.stringify({ actor, camera });
    patch.camera_direction = camera;
  }
  return patch;
}

function StoryShot({ scene, locked, working, onSave }: {
  scene: VisualPlanScene;
  locked: boolean;
  working: boolean;
  onSave: (id: string, changes: Partial<EditableDirection>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => draftFromScene(scene));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const active = useRef(false);
  const saved = draftFromScene(scene);
  const direction = readSceneDirections(scene);
  const issue = directionIssues(direction);
  const changed = Object.keys(directorDirectionPatchSafe(scene, draft)).length > 0;
  const currentIssue = directionIssues({ actor: draft.actor.trim(), camera: draft.camera.trim() });

  function change(field: keyof DirectorDraft, value: string) {
    setDraft(previous => ({ ...previous, [field]: value }));
    setError("");
  }
  async function save() {
    if (active.current || saving || working || locked) return;
    let patch: Partial<EditableDirection>;
    try { patch = directorDirectionPatch(scene, draft); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Clarify this scene before saving."); return; }
    if (!Object.keys(patch).length) return;
    active.current = true; setSaving(true); setError("");
    try {
      await onSave(scene.id, patch);
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't save this scene. Your current edits are still here.");
    } finally { active.current = false; setSaving(false); }
  }

  return <article className="director-shot-card" aria-label={`Scene ${scene.scene_number} director review`}>
    <div className="director-shot-topline"><span className="eyebrow">SCENE {String(scene.scene_number).padStart(2, "0")}</span>
      <span>{Math.max(0, scene.start_time).toFixed(1)}–{Math.max(0, scene.end_time).toFixed(1)} sec</span></div>
    <h3>{scene.title || "Untitled scene"}</h3>
    <p className="director-shot-disclaimer">Proposed story direction, not generated footage.</p>
    <dl className="director-shot-description">
      <div><dt>Lyric / musical moment</dt><dd>{scene.lyric_moment || "No precise lyric assigned; check the timing."}</dd></div>
      <div><dt>What we'll see</dt><dd>{scene.visual_direction || "No visual proposal saved yet."}</dd></div>
      <div><dt>What happens</dt><dd>{direction.actor || "No clear action assigned yet."}</dd></div>
      <div><dt>Camera</dt><dd>{direction.camera || "Camera direction needs review."}</dd></div>
      <div><dt>Feeling</dt><dd>{scene.mood || "Not specified"}</dd></div>
      <div><dt>Setting</dt><dd>{scene.location || "Refer to the approved World"}</dd></div>
    </dl>
    {(issue.actor || issue.camera) && <p className="director-shot-warning" role="status">Before motion: {issue.actor || issue.camera}</p>}
    {!locked && <>
      <button type="button" className="secondary-button" aria-expanded={editing} disabled={working || saving}
        onClick={() => { setEditing(old => !old); setDraft(saved); setError(""); }}>
        {editing ? "Cancel changes" : "Change this scene"}
      </button>
      {editing && <div className="director-shot-editor">
        <p>Direct the moment in your own words. Only the fields you change will be saved; nothing is approved or rendered.</p>
        <label>What should the audience see?
          <textarea rows={4} maxLength={5000} value={draft.visual} disabled={working || saving}
            onChange={event => change("visual", event.target.value)} />
        </label>
        <label>What should the person or subject do?
          <textarea rows={3} maxLength={200} value={draft.actor} disabled={working || saving}
            placeholder="Describe one visible action" onChange={event => change("actor", event.target.value)} />
        </label>
        <label>What should the camera do?
          <textarea rows={2} maxLength={140} value={draft.camera} disabled={working || saving}
            placeholder="For example: Camera holds still." onChange={event => change("camera", event.target.value)} />
        </label>
        <label>What feeling should this moment convey?
          <input maxLength={400} value={draft.mood} disabled={working || saving}
            onChange={event => change("mood", event.target.value)} />
        </label>
        {(currentIssue.actor || currentIssue.camera) && <p className="director-shot-warning">Motion direction check: {currentIssue.actor || currentIssue.camera}</p>}
        <p>Timing, assigned lyrics, approved characters, setting and continuity stay untouched. For those advanced changes, open the individual scene editor.</p>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button type="button" className="primary-button" disabled={working || saving || !changed}
          onClick={() => void save()}>{saving || working ? "Saving…" : "Save my direction"}</button>
      </div>}
    </>}
    {locked && <p>The artist locked this plan. Create an editable revision to change a scene.</p>}
  </article>;
}
function directorDirectionPatchSafe(scene: VisualPlanScene, draft: DirectorDraft): Partial<EditableDirection> {
  try { return directorDirectionPatch(scene, draft); }
  catch { return { movement_direction: draft.actor }; }
}
export default function DirectorStoryboard({ scenes, locked, working, onSave }: {
  scenes: VisualPlanScene[];
  locked: boolean;
  working: boolean;
  onSave: (id: string, changes: Partial<EditableDirection>) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selectedIndex = Math.max(0, scenes.findIndex(scene => scene.id === selectedId));
  const selected = scenes[selectedIndex];
  const ready = scenes.filter(scene => {
    const issues = directionIssues(readSceneDirections(scene));
    return !issues.actor && !issues.camera && Boolean(scene.visual_direction?.trim());
  }).length;
  useEffect(() => {
    if (selectedId && !scenes.some(scene => scene.id === selectedId)) setSelectedId("");
  }, [selectedId, scenes]);
  if (!selected) return null;
  return <section className="director-storyboard" aria-label="Director's storyboard">
    <div className="director-storyboard-heading">
      <div><span className="eyebrow">THE DIRECTOR'S DESK</span><h2>Your video, scene by scene</h2>
        <p>Review the AI's story as a director. Keep the moments you like; change only the ones you don't. No technical setup required.</p></div>
      <p className="director-storyboard-progress" role="status">{ready} of {scenes.length} scenes have clear saved image and motion directions.</p>
    </div>
    <nav className="director-storyboard-nav" aria-label="Browse your video scenes">
      <button type="button" className="secondary-button" disabled={selectedIndex === 0}
        onClick={() => setSelectedId(scenes[selectedIndex - 1].id)}>Previous</button>
      <label>Scene
        <select value={selected.id} onChange={event => setSelectedId(event.target.value)}>
          {scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.scene_number} · {scene.title || "Untitled"}</option>)}
        </select>
      </label>
      <button type="button" className="secondary-button" disabled={selectedIndex >= scenes.length - 1}
        onClick={() => setSelectedId(scenes[selectedIndex + 1].id)}>Next</button>
    </nav>
    <p className="director-storyboard-counter">Scene {selectedIndex + 1} of {scenes.length}. Reviewing a scene does not approve or render it.</p>
    <StoryShot key={`${selected.id}:${selected.updated_at}`} scene={selected} locked={locked} working={working} onSave={onSave} />
  </section>;
}
