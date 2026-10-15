import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import CharacterEditor from "../components/style/CharacterEditor";
import EnvironmentEditor from "../components/style/EnvironmentEditor";
import { useStyleStudio } from "../hooks/useStyleStudio";
import { formatCreativeLines } from "../lib/formatCreativeText";
import StudioHeader from "../components/navigation/StudioHeader";

function StyleValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) return <div className="style-value-list">{value.length ? value.map((item, index) => <div className="style-value-item" key={index}><StyleValue value={item} /></div>) : <span className="style-muted">Not specified</span>}</div>;
  if (value && typeof value === "object") return <div className="style-value-object">{Object.entries(value as Record<string, unknown>).map(([key, item]) => <div className="style-value-row" key={key}><span>{key.replace(/_/g, " ")}</span><StyleValue value={item} /></div>)}</div>;
  if (value === null || value === undefined || value === "") return <span className="style-muted">Not specified</span>;
  return <span>{String(value)}</span>;
}

export default function StylePage({ projectId }: { projectId: string }) {
  const {
    world,
    styleBible,
    characters,
    characterAssets,
    environments,
    environmentAssets,
    loading,
    working,
    error,
    locked,
    lineageConflict,
    restoreApprovedStyleWorld,
    createStyleBible,
    saveStyleBible,
    saveCharacter,
    saveEnvironment,
    approveCharacter,
    approveEnvironment,
    uploadAsset,
    approveAsset,
    generateDescription,
    createRevision,
    approveStyleBible,
    reload,
  } = useStyleStudio(projectId);

  const [visualRules, setVisualRules] = useState("");
  const [referenceAssets, setReferenceAssets] = useState("");
  const [continuityRules, setContinuityRules] = useState("");
  const [newCharacter, setNewCharacter] = useState({ name: "", identity: "", appearance: "", wardrobe: "", behavior: "", continuity: "" });
  const [newEnvironment, setNewEnvironment] = useState({ name: "", purpose: "", layout: "", architecture: "", surfaces: "", lighting: "", atmosphere: "", continuity: "" });

  function editableLines(value: unknown): string {
    return formatCreativeLines(value).join("\n");
  }

  useEffect(() => {
    if (!styleBible) return;
    setVisualRules(editableLines(styleBible.visual_rules));
    setReferenceAssets(editableLines(styleBible.reference_assets));
    setContinuityRules(editableLines(styleBible.continuity_rules));
  // Preserve unsaved Style Bible edits when a character or image is refreshed.
  }, [styleBible?.id, styleBible?.updated_at, styleBible?.status]);

  if (loading) return <main className="studio-main style-page"><div className="style-loading">Loading Style Studio…</div></main>;

  if (lineageConflict) {
    // A confirmed World revision cannot reuse an older approved Bible's children.
    // No automatic changes; the creator decides which World version is active.
    return (
      <main className="studio-main style-page">
        <header className="style-header"><div>
          <span className="eyebrow">PHASE 3 / STYLE BIBLE</span>
          <h1>Choose the World for your Style Bible</h1>
          <p>Your project has a newer confirmed World, but your saved Style Bible and its approved creative assets belong to the previous World revision.</p>
        </div></header>
        <section className="style-empty-panel">
          <p role="status">Your approved Style Bible is preserved. BeatVision has stopped automatic character and environment creation until the World versions agree.</p>
          <p>Active World: {lineageConflict.activeWorldId.slice(0, 8)}…</p>
          <p>Approved Style World: {lineageConflict.styleWorldId.slice(0, 8)}…</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="style-actions">
            <a className="secondary-button" href={`/projects/${projectId}/world`}>Review newer World</a>
            {lineageConflict.styleStatus === "approved" && (
              <button type="button" disabled={working} onClick={() => {
                if (window.confirm("Restore the earlier confirmed World associated with your approved Style Bible? Your newer World revision stays saved. No Style Bible, characters, environments, storyboards or media will be overwritten.")) {
                  void restoreApprovedStyleWorld().catch(() => { /* Hook shows error. */ });
                }
              }}>{working ? "Restoring approved World…" : "Restore World used by approved Style Bible"}</button>
            )}
            <button type="button" disabled={working} onClick={() => void reload().catch(() => { /* Hook shows error. */ })}>Recheck World versions</button>
          </div>
          <p>To keep the newer World instead, leave it selected. A new Style Bible revision must be created before generating downstream assets for that World. This page will not silently rebind existing approvals.</p>
        </section>
      </main>
    );
  }

  if (!styleBible) {
    // A failed load is NOT evidence of a missing Style Bible. Never offer
    // duplicate creation when the account, World, or DB read is failing.
    if (error || !world || world.status !== "completed" || !world.confirmed_at) {
      return (
        <main className="studio-main style-page">
          <header className="style-header"><div><span className="eyebrow">PHASE 3 / STYLE BIBLE</span><h1>Unable to load Style Studio</h1></div></header>
          <section className="style-empty-panel">
            <p className="form-error" role="alert">{error || "Confirm the project's Visual World before continuing."}</p>
            <button type="button" disabled={working} onClick={() => void reload().catch(() => { /* Hook shows error. */ })}>
              Retry Style Studio Load
            </button>
          </section>
        </main>
      );
    }
    return (
      <main className="studio-main style-page">
        <header className="style-header"><div><span className="eyebrow">PHASE 3 / STYLE BIBLE</span><h1>Create Style Bible</h1>
        <p>The Style Bible will be created from the confirmed World Report. Its world foundation is lineage data, not a disposable UI copy.</p></div></header><section className="style-empty-panel"><button disabled={working} onClick={() => void createStyleBible()}>
          {working ? "Creating…" : "Create Style Bible from Confirmed World"}
        </button>
        {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  function saveStyle(event: FormEvent) {
    event.preventDefault();
    void saveStyleBible({
      visual_rules: visualRules.split("\n").map((value) => value.trim()).filter(Boolean),
      reference_assets: referenceAssets.split("\n").map((value) => value.trim()).filter(Boolean),
      continuity_rules: continuityRules.split("\n").map((value) => value.trim()).filter(Boolean),
    }).catch(() => { /* The hook displays the actionable error. */ });
  }

  function createCharacter(event: FormEvent) {
    event.preventDefault();
    void saveCharacter(null, {
      name: newCharacter.name,
      sheet: {
        identity: newCharacter.identity,
        appearance: newCharacter.appearance,
        wardrobe: newCharacter.wardrobe,
        behavior: newCharacter.behavior,
        continuity: newCharacter.continuity,
      },
    }).then(() => setNewCharacter({ name: "", identity: "", appearance: "", wardrobe: "", behavior: "", continuity: "" }))
      .catch(() => { /* Preserve input; the hook shows the failure. */ });
  }

  function createEnvironment(event: FormEvent) {
    event.preventDefault();
    void saveEnvironment(null, {
      name: newEnvironment.name,
      sheet: {
        purpose: newEnvironment.purpose,
        layout: newEnvironment.layout,
        architecture: newEnvironment.architecture,
        surfaces: newEnvironment.surfaces,
        lighting: newEnvironment.lighting,
        atmosphere: newEnvironment.atmosphere,
        continuity: newEnvironment.continuity,
      },
    }).then(() => setNewEnvironment({ name: "", purpose: "", layout: "", architecture: "", surfaces: "", lighting: "", atmosphere: "", continuity: "" }))
      .catch(() => { /* Preserve input; the hook shows the failure. */ });
  }

  function characterRevisionIds(startId: string) {
    const row = characters.find((item) => item.id === startId);
    return new Set([startId, ...(row?.revision_ancestor_ids ?? [])]);
  }

  function environmentRevisionIds(startId: string) {
    const row = environments.find((item) => item.id === startId);
    return new Set([startId, ...(row?.revision_ancestor_ids ?? [])]);
  }

  return (
    <div className="app-shell">
      <StudioHeader
        projectId={projectId}
        activeStage="style"
        statusBadge={locked ? "STYLE LOCKED" : "DRAFT"}
      />

      <main className="style-page">
        {error && <p className="form-error style-error" role="alert">{error}</p>}

        <header className="style-header">
          <div>
            <span className="eyebrow">03 / STYLE BIBLE & CASTING</span>
            <h1>Style Bible & Continuity Rules</h1>
            <p>
              {locked
                ? "The approved Style Bible is locked and immutable. Characters and environments inherit these rules."
                : "Translate the confirmed World into repeatable visual rules, character wardrobe continuity, environments, and reference language."}
            </p>
          </div>
          <span className={`status-badge ${locked ? "status-approved" : "status-draft"}`}>
            {locked ? "STYLE BIBLE LOCKED" : "DRAFT MODE"}
          </span>
        </header>

        <nav className="style-actions style-stage-navigation" aria-label="Style stage navigation">
          <a className="secondary-button" href={`/projects/${projectId}/world`}>Return to World</a>
          {locked ? <a className="primary-button" href={`/projects/${projectId}/visual-plan`}>Continue to Visual Plan</a>
            : <p role="status">Lock the Style Bible to continue to Visual Plan.</p>}
        </nav>

        <section className="style-section">
          <div className="style-section-heading">
            <div>
              <span className="eyebrow">01 / WORLD FOUNDATION</span>
              <h2>Visual Rules & References</h2>
            </div>
            <span className="style-lineage" style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-dim)" }}>
              World ID: {world?.id ? `${world.id.slice(0, 8)}…` : "Unavailable"}
            </span>
          </div>

          <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "20px" }}>
            These foundation parameters come directly from your confirmed Visual World Report.
          </p>

          <div className="style-foundation-grid">
            {Object.entries(styleBible.world_basis ?? {}).map(([key, value]) => (
              <article className="style-foundation-card" key={key}>
                <span className="style-card-label">{key.replace(/_/g, " ")}</span>
                <StyleValue value={value} />
              </article>
            ))}
          </div>

          <form className="style-form" onSubmit={saveStyle}>
            <label>
              Visual Rules (one rule per line)
              <textarea rows={6} value={visualRules} readOnly={locked} onChange={(e) => setVisualRules(e.target.value)} />
            </label>
            <label>
              Reference Assets (URLs/paths per line)
              <textarea rows={6} value={referenceAssets} readOnly={locked} onChange={(e) => setReferenceAssets(e.target.value)} />
            </label>
            <label>
              Continuity Directives (one per line)
              <textarea rows={6} value={continuityRules} readOnly={locked} onChange={(e) => setContinuityRules(e.target.value)} />
            </label>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: "12px" }}>
              <button className="primary-button" disabled={working || locked}>
                {working ? "Saving…" : "Save Style Bible"}
              </button>
              {!locked && (
                <button
                  type="button"
                  className="primary-button"
                  style={{ background: "var(--color-success)", borderColor: "var(--color-success)", color: "#000" }}
                  disabled={working}
                  onClick={() => void approveStyleBible().catch(() => {})}
                >
                  {working ? "Locking…" : "Lock Style Bible ✓"}
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="style-section">
          <div className="style-section-heading">
            <div>
              <span className="eyebrow">02 / CAST & CHARACTERS</span>
              <h2>Characters ({characters.length})</h2>
            </div>
          </div>

          <form className="style-create-card" onSubmit={createCharacter}>
            <div className="style-create-heading">
              <span>Add New Character</span>
              <small style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Define identity and wardrobe before adding reference photos.</small>
            </div>
            <label>Character Name <input required value={newCharacter.name} onChange={(e) => setNewCharacter((s) => ({ ...s, name: e.target.value }))} /></label>
            <label>Identity <textarea rows={2} value={newCharacter.identity} onChange={(e) => setNewCharacter((s) => ({ ...s, identity: e.target.value }))} /></label>
            <label>Appearance <textarea rows={2} value={newCharacter.appearance} onChange={(e) => setNewCharacter((s) => ({ ...s, appearance: e.target.value }))} /></label>
            <label>Wardrobe & Props <textarea rows={2} value={newCharacter.wardrobe} onChange={(e) => setNewCharacter((s) => ({ ...s, wardrobe: e.target.value }))} /></label>
            <label>Behavior & Movement <textarea rows={2} value={newCharacter.behavior} onChange={(e) => setNewCharacter((s) => ({ ...s, behavior: e.target.value }))} /></label>
            <label>Continuity Directives <textarea rows={2} value={newCharacter.continuity} onChange={(e) => setNewCharacter((s) => ({ ...s, continuity: e.target.value }))} /></label>
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="secondary-button" disabled={working}>
                {working ? "Adding…" : "+ Add Character Sheet"}
              </button>
            </div>
          </form>

          {characters.map((character) => (
            <CharacterEditor
              key={character.id}
              character={character}
              assets={characterAssets.filter((asset) => characterRevisionIds(character.id).has(asset.character_id))}
              working={working}
              onSave={(id, input) => saveCharacter(id, input)}
              onUpload={(file, label) => uploadAsset("character", character.id, file, label)}
              onApproveAsset={(asset) => approveAsset("character", asset.id)}
              onGenerate={(character) => generateDescription("character", character.id)}
              onCreateRevision={(character, proposal) => createRevision("character", character.id, proposal)}
              onRefresh={reload}
              onApprove={(character) => approveCharacter(character.id)}
            />
          ))}
        </section>

        <section className="style-section">
          <div className="style-section-heading">
            <div>
              <span className="eyebrow">03 / WORLD SPACES & LOCATIONS</span>
              <h2>Environments ({environments.length})</h2>
            </div>
          </div>

          <form className="style-create-card" onSubmit={createEnvironment}>
            <div className="style-create-heading">
              <span>Add New Environment</span>
              <small style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Define architecture, lighting, and surfaces.</small>
            </div>
            <label>Environment Name <input required value={newEnvironment.name} onChange={(e) => setNewEnvironment((s) => ({ ...s, name: e.target.value }))} /></label>
            <label>Purpose / Narrative Role <textarea rows={2} value={newEnvironment.purpose} onChange={(e) => setNewEnvironment((s) => ({ ...s, purpose: e.target.value }))} /></label>
            <label>Layout & Framing <textarea rows={2} value={newEnvironment.layout} onChange={(e) => setNewEnvironment((s) => ({ ...s, layout: e.target.value }))} /></label>
            <label>Architecture & Materials <textarea rows={2} value={newEnvironment.architecture} onChange={(e) => setNewEnvironment((s) => ({ ...s, architecture: e.target.value }))} /></label>
            <label>Surfaces & Props <textarea rows={2} value={newEnvironment.surfaces} onChange={(e) => setNewEnvironment((s) => ({ ...s, surfaces: e.target.value }))} /></label>
            <label>Lighting & Color Palette <textarea rows={2} value={newEnvironment.lighting} onChange={(e) => setNewEnvironment((s) => ({ ...s, lighting: e.target.value }))} /></label>
            <label>Atmosphere <textarea rows={2} value={newEnvironment.atmosphere} onChange={(e) => setNewEnvironment((s) => ({ ...s, atmosphere: e.target.value }))} /></label>
            <label>Continuity Directives <textarea rows={2} value={newEnvironment.continuity} onChange={(e) => setNewEnvironment((s) => ({ ...s, continuity: e.target.value }))} /></label>
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="secondary-button" disabled={working}>
                {working ? "Adding…" : "+ Add Environment Space"}
              </button>
            </div>
          </form>

          {environments.map((environment) => (
            <EnvironmentEditor
              key={environment.id}
              environment={environment}
              assets={environmentAssets.filter((asset) => environmentRevisionIds(environment.id).has(asset.environment_id))}
              working={working}
              onSave={(id, input) => saveEnvironment(id, input)}
              onUpload={(file, label) => uploadAsset("environment", environment.id, file, label)}
              onApproveAsset={(asset) => approveAsset("environment", asset.id)}
              onGenerate={(environment) => generateDescription("environment", environment.id)}
              onCreateRevision={(environment, proposal) => createRevision("environment", environment.id, proposal)}
              onRefresh={reload}
              onApprove={(environment) => approveEnvironment(environment.id)}
            />
          ))}
        </section>

        {locked && (
          <nav className="style-actions style-stage-navigation" aria-label="Continue after Style Studio">
            <a className="primary-button" href={`/projects/${projectId}/visual-plan`}>Continue to Visual Plan</a>
          </nav>
        )}
      </main>
    </div>
  );
}
