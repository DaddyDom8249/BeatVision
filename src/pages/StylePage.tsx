import { FormEvent, useMemo, useState } from "react";
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
  } = useStyleStudio(projectId);

  const [visualRules, setVisualRules] = useState("");
  const [referenceAssets, setReferenceAssets] = useState("");
  const [continuityRules, setContinuityRules] = useState("");
  const [newCharacter, setNewCharacter] = useState({ name: "", identity: "", appearance: "", wardrobe: "", behavior: "", continuity: "" });
  const [newEnvironment, setNewEnvironment] = useState({ name: "", purpose: "", layout: "", architecture: "", surfaces: "", lighting: "", atmosphere: "", continuity: "" });

  const styleInitialised = useMemo(() => {
    if (!styleBible) return false;
    setVisualRules(""); setReferenceAssets(""); setContinuityRules("");
    return true;
  }, [styleBible?.id]);

  if (loading) return <main><p>Loading Style Studio…</p></main>;

  if (locked) {
    return (
      <main>
        <h1>Style Bible Locked</h1>
        <p>Phase 3 begins only after the Visual World Report is completed and explicitly confirmed.</p>
        <a href={`/projects/${projectId}/world`}>Return to Visual World Report</a>
      </main>
    );
  }

  function saveStyle(event: FormEvent) {
    event.preventDefault();
    void saveStyleBible({
      visual_rules: visualRules.split("\n").map((value) => value.trim()).filter(Boolean),
      reference_assets: referenceAssets.split("\n").map((value) => value.trim()).filter(Boolean),
      continuity_rules: continuityRules.split("\n").map((value) => value.trim()).filter(Boolean),
    }).then(() => {
      setVisualRules("");
      setReferenceAssets("");
      setContinuityRules("");
    });
  }

  function updateStyleInputs() {
    if (!styleBible) return;
    setVisualRules(Array.isArray(styleBible.visual_rules) ? styleBible.visual_rules.join("\n") : "");
    setReferenceAssets(Array.isArray(styleBible.reference_assets) ? styleBible.reference_assets.join("\n") : "");
    setContinuityRules(Array.isArray(styleBible.continuity_rules) ? styleBible.continuity_rules.join("\n") : "");
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

  if (!styleInitialised) return <main><p>Preparing Style Bible…</p></main>;

  return (
    <main>
      <h1>Style Bible</h1>
      <p>Bound to confirmed World Report: <code>{world?.id}</code></p>

      <section>
        <h2>World Foundation</h2>
        <p>The fields below are copied from the confirmed World Report and remain the source lineage for this stage.</p>
        <pre>{JSON.stringify(styleBible?.world_basis, null, 2)}</pre>
        <form onSubmit={saveStyle}>
          <label>Visual rules, one per line
            <textarea rows={8} value={visualRules} onChange={(e) => setVisualRules(e.target.value)} onFocus={updateStyleInputs} />
          </label>
          <label>Reference assets, one URL/path per line
            <textarea rows={8} value={referenceAssets} onChange={(e) => setReferenceAssets(e.target.value)} onFocus={updateStyleInputs} />
          </label>
          <label>Continuity rules, one per line
            <textarea rows={8} value={continuityRules} onChange={(e) => setContinuityRules(e.target.value)} onFocus={updateStyleInputs} />
          </label>
          <button disabled={working}>{working ? "Saving…" : "Save Style Bible"}</button>
        </form>
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
