import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Environment, EnvironmentAsset } from "../../types/style";
import AssetList from "./AssetList";

const emptySheet = { purpose: "", layout: "", architecture: "", surfaces: "", lighting: "", atmosphere: "", continuity: "" };

export default function EnvironmentEditor({
  environment,
  assets,
  working,
  onSave,
  onUpload,
  onApproveAsset,
}: {
  environment: Environment;
  assets: EnvironmentAsset[];
  working: boolean;
  onSave: (id: string, input: { name: string; sheet: Record<string, string> }) => Promise<unknown>;
  onUpload: (file: File, label: string) => Promise<unknown>;
  onApproveAsset: (asset: EnvironmentAsset) => Promise<unknown>;
}) {
  const initial = useMemo(() => ({ ...emptySheet, ...environment.sheet }), [environment.sheet]);
  const [name, setName] = useState(environment.name);
  const [sheet, setSheet] = useState(initial);

  useEffect(() => {
    setName(environment.name);
    setSheet({ ...emptySheet, ...environment.sheet });
  }, [environment]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void onSave(environment.id, { name, sheet });
  }

  return (
    <article>
      <h3>{environment.name}</h3>
      <form onSubmit={submit}>
        <label>Name <input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Purpose / narrative role <textarea rows={3} value={sheet.purpose} onChange={(e) => setSheet((s) => ({ ...s, purpose: e.target.value }))} /></label>
        <label>Layout / composition <textarea rows={3} value={sheet.layout} onChange={(e) => setSheet((s) => ({ ...s, layout: e.target.value }))} /></label>
        <label>Architecture / structure <textarea rows={3} value={sheet.architecture} onChange={(e) => setSheet((s) => ({ ...s, architecture: e.target.value }))} /></label>
        <label>Surfaces / props <textarea rows={3} value={sheet.surfaces} onChange={(e) => setSheet((s) => ({ ...s, surfaces: e.target.value }))} /></label>
        <label>Lighting / color <textarea rows={3} value={sheet.lighting} onChange={(e) => setSheet((s) => ({ ...s, lighting: e.target.value }))} /></label>
        <label>Atmosphere <textarea rows={3} value={sheet.atmosphere} onChange={(e) => setSheet((s) => ({ ...s, atmosphere: e.target.value }))} /></label>
        <label>Continuity / must-not-change <textarea rows={3} value={sheet.continuity} onChange={(e) => setSheet((s) => ({ ...s, continuity: e.target.value }))} /></label>
        <button disabled={working}>{working ? "Saving…" : "Save Environment Sheet"}</button>
      </form>
      <h4>Environment Assets</h4>
      <input
        type="file"
        accept="image/*"
        disabled={working}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onUpload(file, file.name);
          event.currentTarget.value = "";
        }}
      />
      <AssetList assets={assets} working={working} onApprove={(asset) => void onApproveAsset(asset)} />
    </article>
  );
}
