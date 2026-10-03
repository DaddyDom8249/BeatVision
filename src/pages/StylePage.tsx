import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import CharacterEditor from "../components/style/CharacterEditor";
import EnvironmentEditor from "../components/style/EnvironmentEditor";
import { useStyleStudio } from "../hooks/useStyleStudio";

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
    uploadAsset,
    approveAsset,
    approveStyleBible,
  } = useStyleStudio(projectId);

  const [visualRules, setVisualRules] = useState("");
  const [referenceAssets, setReferenceAssets] = useState("");
  const [continuityRules, setContinuityRules] = useState("");
  const [newCharacter, setNewCharacter] = useState({ name: "", identity: "", appearance: "", wardrobe: "", behavior: "", continuity: "" });
  const [newEnvironment, setNewEnvironment] = useState({ name: "", purpose: "", layout: "", architecture: "", surfaces: "", lighting: "", atmosphere: "", continuity: "" });

  useEffect(() => {
    if (!styleBible) return;
    setVisualRules(Array.isArray(styleBible.visual_rules) ? styleBible.visual_rules.join("\n") : "");
    setReferenceAssets(Array.isArray(styleBible.reference_assets) ? styleBible.reference_assets.join("\n") : "");
    setContinuityRules(Array.isArray(styleBible.continuity_rules) ? styleBible.continuity_rules.join("\n") : "");
  }, [styleBible]);

  if (loading) return <main><p>Loading Style Studio…</p></main>;

  if (locked) {
    return (
      <main>
        <h1>Style Bible Locked</h1>
        <p>The Style Bible is approved and immutable.</p>
        <a href={`/projects/${projectId}/visual-plan`}>Continue to Visual Plan</a>
      </main>
    );
  }

  if (!styleBible) {
    return (
      <main>
        <h1>Create Style Bible</h1>
        <p>The Style Bible will be created from the confirmed World Report. Its world foundation is lineage data, not a disposable UI copy.</p>
        <button disabled={working} onClick={() => void createStyleBible()}>
          {working ? "Creating…" : "Create Style Bible from Confirmed World"}
        </button>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  }

  function saveStyle(event: FormEvent) {
    event.preventDefault();
    void saveStyleBible({
      visual_rules: visualRules.split("\n").map((value) => value.trim()).filter(Boolean),
      reference_assets: referenceAssets.split("\n").map((value) => value.trim()).filter(Boolean),
      continuity_rules: continuityRules.split("\n").map((value) => value.trim()).filter(Boolean),
    });
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
    }).then(() => setNewCharacter({ name: "", identity: "", appearance: "", wardrobe: "", behavior: "", continuity: "" }));
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
    }).then(() => setNewEnvironment({ name: "", purpose: "", layout: "", architecture: "", surfaces: "", lighting: "", atmosphere: "", continuity: "" }));
  }

  return (
    <main>
      {error && <p role="alert">{error}</p>}
      <h1>Style Bible</h1>
      <p>Bound to confirmed World Report: <code>{world?.id}</code></p>

      <section>
        <h2>World Foundation</h2>
        <p>The fields below are copied from the confirmed World Report and remain the source lineage for this stage.</p>
        <pre>{JSON.stringify(styleBible.world_basis, null, 2)}</pre>
        <form onSubmit={saveStyle}>
          <label>Visual rules, one per line
            <textarea rows={8} value={visualRules} onChange={(e) => setVisualRules(e.target.value)} />
          </label>
          <label>Reference assets, one URL/path per line
            <textarea rows={8} value={referenceAssets} onChange={(e) => setReferenceAssets(e.target.value)} />
          </label>
          <label>Continuity rules, one per line
            <textarea rows={8} value={continuityRules} onChange={(e) => setContinuityRules(e.target.value)} />
          </label>
          <button disabled={working}>{working ? "Saving…" : "Save Style Bible"}</button>
        </form>
        <button
          disabled={working}
          onClick={() => void approveStyleBible()}
        >
          {working ? "Locking…" : "Lock Style Bible"}
        </button>
      </section>

      <section>
        <h2>Characters</h2>
        <form onSubmit={createCharacter}>
          <h3>Add Character</h3>
          <label>Name <input required value={newCharacter.name} onChange={(e) => setNewCharacter((s) => ({ ...s, name: e.target.value }))} /></label>
          <label>Identity <textarea value={newCharacter.identity} onChange={(e) => setNewCharacter((s) => ({ ...s, identity: e.target.value }))} /></label>
          <label>Appearance <textarea value={newCharacter.appearance} onChange={(e) => setNewCharacter((s) => ({ ...s, appearance: e.target.value }))} /></label>
          <label>Wardrobe / props <textarea value={newCharacter.wardrobe} onChange={(e) => setNewCharacter((s) => ({ ...s, wardrobe: e.target.value }))} /></label>
          <label>Behavior / movement <textarea value={newCharacter.behavior} onChange={(e) => setNewCharacter((s) => ({ ...s, behavior: e.target.value }))} /></label>
          <label>Continuity / must-not-change <textarea value={newCharacter.continuity} onChange={(e) => setNewCharacter((s) => ({ ...s, continuity: e.target.value }))} /></label>
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
          />
        ))}
      </section>

      <section>
        <h2>Environments</h2>
        <form onSubmit={createEnvironment}>
          <h3>Add Environment</h3>
          <label>Name <input required value={newEnvironment.name} onChange={(e) => setNewEnvironment((s) => ({ ...s, name: e.target.value }))} /></label>
          <label>Purpose / narrative role <textarea value={newEnvironment.purpose} onChange={(e) => setNewEnvironment((s) => ({ ...s, purpose: e.target.value }))} /></label>
          <label>Layout / composition <textarea value={newEnvironment.layout} onChange={(e) => setNewEnvironment((s) => ({ ...s, layout: e.target.value }))} /></label>
          <label>Architecture / structure <textarea value={newEnvironment.architecture} onChange={(e) => setNewEnvironment((s) => ({ ...s, architecture: e.target.value }))} /></label>
          <label>Surfaces / props <textarea value={newEnvironment.surfaces} onChange={(e) => setNewEnvironment((s) => ({ ...s, surfaces: e.target.value }))} /></label>
          <label>Lighting / color <textarea value={newEnvironment.lighting} onChange={(e) => setNewEnvironment((s) => ({ ...s, lighting: e.target.value }))} /></label>
          <label>Atmosphere <textarea value={newEnvironment.atmosphere} onChange={(e) => setNewEnvironment((s) => ({ ...s, atmosphere: e.target.value }))} /></label>
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
          />
        ))}
      </section>
    </main>
  );
}
