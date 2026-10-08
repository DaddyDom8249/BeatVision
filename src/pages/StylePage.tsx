import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import CharacterEditor from "../components/style/CharacterEditor";
import EnvironmentEditor from "../components/style/EnvironmentEditor";
import { useStyleStudio } from "../hooks/useStyleStudio";
import { formatCreativeLines } from "../lib/formatCreativeText";

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
    createStyleBible,
    saveStyleBible,
    saveCharacter,
    saveEnvironment,
    approveCharacter,
    approveEnvironment,
    uploadAsset,
    approveAsset,
    approveStyleBible,
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
  }, [styleBible]);

  if (loading) return <main className="studio-main style-page"><div className="style-loading">Loading Style Studio…</div></main>;

  if (!styleBible) {
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

  return (
    <main className="studio-main style-page">
      {error && <p className="form-error style-error" role="alert">{error}</p>}
      <header className="style-header"><div><span className="eyebrow">PHASE 3 / STYLE BIBLE</span><h1>Style Bible</h1><p>{locked ? "The approved Style Bible is immutable. Character and environment drafts continue from this locked creative source." : "Translate the confirmed World into repeatable visual rules, character continuity, environments, and reference language."}</p></div><div className="style-status">{locked ? "APPROVED / DOWNSTREAM ASSETS" : "DRAFT / WORLD BOUND"}</div></header>

      <section className="style-section">
        <div className="style-section-heading"><div><span className="panel-label">01 / SOURCE</span><h2>World Foundation</h2></div><span className="style-lineage">World: {world?.id ? `${world.id.slice(0, 8)}…` : "Unavailable"}</span></div>
        <p className="style-section-copy">These fields come from the confirmed World Report. They are reference data for this stage, not an editable replacement for the World.</p><div className="style-foundation-grid">{Object.entries(styleBible.world_basis ?? {}).map(([key, value]) => <article className="style-foundation-card" key={key}><span className="style-card-label">{key.replace(/_/g, " ")}</span><StyleValue value={value} /></article>)}</div>
        <form className="style-form" onSubmit={saveStyle}>
          <label>Visual rules, one per line
            <textarea rows={8} value={visualRules} readOnly={locked} onChange={(e) => setVisualRules(e.target.value)} />
          </label>
          <label>Reference assets, one URL/path per line
            <textarea rows={8} value={referenceAssets} readOnly={locked} onChange={(e) => setReferenceAssets(e.target.value)} />
          </label>
          <label>Continuity rules, one per line
            <textarea rows={8} value={continuityRules} readOnly={locked} onChange={(e) => setContinuityRules(e.target.value)} />
          </label>
          <button disabled={working || locked}>{working ? "Saving…" : "Save Style Bible"}</button>
        </form>
        {!locked && (<button
          disabled={working}
          onClick={() => void approveStyleBible().catch(() => { /* Error shown by hook. */ })}
        >
          {working ? "Locking…" : "Lock Style Bible"}
        </button>)}
      </section>

      <section className="style-section">
        <div className="style-section-heading"><div><span className="panel-label">02 / CAST</span><h2>Characters</h2></div><span className="style-count">{characters.length} {characters.length === 1 ? "character" : "characters"}</span></div>
        <form className="style-create-card" onSubmit={createCharacter}>
          <div className="style-create-heading"><span>New character</span><small>Define identity before adding reference assets.</small></div>
          <label className="style-field"><span>Name</span><input required value={newCharacter.name} onChange={(e) => setNewCharacter((s) => ({ ...s, name: e.target.value }))} /></label>
          <label className="style-field"><span>Identity</span><textarea value={newCharacter.identity} onChange={(e) => setNewCharacter((s) => ({ ...s, identity: e.target.value }))} /></label>
          <label className="style-field"><span>Appearance</span><textarea value={newCharacter.appearance} onChange={(e) => setNewCharacter((s) => ({ ...s, appearance: e.target.value }))} /></label>
          <label className="style-field"><span>Wardrobe / props</span><textarea value={newCharacter.wardrobe} onChange={(e) => setNewCharacter((s) => ({ ...s, wardrobe: e.target.value }))} /></label>
          <label className="style-field"><span>Behavior / movement</span><textarea value={newCharacter.behavior} onChange={(e) => setNewCharacter((s) => ({ ...s, behavior: e.target.value }))} /></label>
          <label className="style-field"><span>Continuity / must-not-change</span><textarea value={newCharacter.continuity} onChange={(e) => setNewCharacter((s) => ({ ...s, continuity: e.target.value }))} /></label>
          <button disabled={working}>{working ? "Creating…" : "Add Character"}</button>
        </form>

        {characters.map((character) => (
          <CharacterEditor
            key={character.id}
            character={character}
            assets={characterAssets.filter((asset) => asset.character_id === character.id)}
            working={working}
            onSave={(id, input) => saveCharacter(id, input)}
            onUpload={(file, label) => uploadAsset("character", character.id, file, label)}
            onApproveAsset={(asset) => approveAsset("character", asset.id)}
            onApprove={(character) => approveCharacter(character.id)}
          />
        ))}
      </section>

      <section className="style-section">
        <div className="style-section-heading"><div><span className="panel-label">03 / WORLD SPACES</span><h2>Environments</h2></div><span className="style-count">{environments.length} {environments.length === 1 ? "environment" : "environments"}</span></div>
        <form className="style-create-card" onSubmit={createEnvironment}>
          <div className="style-create-heading"><span>New environment</span><small>Define the physical rules of the space.</small></div>
          <label>Name <input required value={newEnvironment.name} onChange={(e) => setNewEnvironment((s) => ({ ...s, name: e.target.value }))} /></label>
          <label className="style-field"><span>Purpose / narrative role</span><textarea value={newEnvironment.purpose} onChange={(e) => setNewEnvironment((s) => ({ ...s, purpose: e.target.value }))} /></label>
          <label className="style-field"><span>Layout / composition</span><textarea value={newEnvironment.layout} onChange={(e) => setNewEnvironment((s) => ({ ...s, layout: e.target.value }))} /></label>
          <label className="style-field"><span>Architecture / structure</span><textarea value={newEnvironment.architecture} onChange={(e) => setNewEnvironment((s) => ({ ...s, architecture: e.target.value }))} /></label>
          <label className="style-field"><span>Surfaces / props</span><textarea value={newEnvironment.surfaces} onChange={(e) => setNewEnvironment((s) => ({ ...s, surfaces: e.target.value }))} /></label>
          <label className="style-field"><span>Lighting / color</span><textarea value={newEnvironment.lighting} onChange={(e) => setNewEnvironment((s) => ({ ...s, lighting: e.target.value }))} /></label>
          <label className="style-field"><span>Atmosphere</span><textarea value={newEnvironment.atmosphere} onChange={(e) => setNewEnvironment((s) => ({ ...s, atmosphere: e.target.value }))} /></label>
          <label>Continuity / must-not-change <textarea value={newEnvironment.continuity} onChange={(e) => setNewEnvironment((s) => ({ ...s, continuity: e.target.value }))} /></label>
          <button disabled={working}>{working ? "Creating…" : "Add Environment"}</button>
        </form>

        {environments.map((environment) => (
          <EnvironmentEditor
            key={environment.id}
            environment={environment}
            assets={environmentAssets.filter((asset) => asset.environment_id === environment.id)}
            working={working}
            onSave={(id, input) => saveEnvironment(id, input)}
            onUpload={(file, label) => uploadAsset("environment", environment.id, file, label)}
            onApproveAsset={(asset) => approveAsset("environment", asset.id)}
            onApprove={(environment) => approveEnvironment(environment.id)}
          />
        ))}
      </section>
    </main>
  );
}
