import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatCreativeRecord } from "../../lib/formatCreativeText";
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
  onApprove,
}: {
  environment: Environment;
  assets: EnvironmentAsset[];
  working: boolean;
  onSave: (id: string, input: { name: string; sheet: Record<string, string> }) => Promise<unknown>;
  onUpload: (file: File, label: string) => Promise<unknown>;
  onApproveAsset: (asset: EnvironmentAsset) => Promise<unknown>;
  onApprove: (environment: Environment) => Promise<unknown>;
}) {
  const initial = useMemo(() => ({ ...emptySheet, ...formatCreativeRecord(environment.sheet) }), [environment.sheet]);
  const [name, setName] = useState(environment.name);
  const [sheet, setSheet] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(environment.name);
    setSheet({ ...emptySheet, ...formatCreativeRecord(environment.sheet) });
    setError(null);
  }, [environment]);

  const isApproved = environment.status === "approved";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isApproved) return;
    setError(null);
    try {
      await onSave(environment.id, { name, sheet });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleApprove() {
    if (isApproved) return;
    setError(null);
    try {
      await onApprove(environment);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <article className="environment-editor-card">
      <div className="environment-card-header">
        <h3>{environment.name}</h3>
        <span className={`status-badge ${environment.status}`}>{isApproved ? "APPROVED" : "DRAFT"}</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form onSubmit={submit}>
        <label>Name <input value={name} readOnly={isApproved} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Purpose / narrative role <textarea rows={3} readOnly={isApproved} value={sheet.purpose} onChange={(e) => setSheet((s) => ({ ...s, purpose: e.target.value }))} /></label>
        <label>Layout / composition <textarea rows={3} readOnly={isApproved} value={sheet.layout} onChange={(e) => setSheet((s) => ({ ...s, layout: e.target.value }))} /></label>
        <label>Architecture / structure <textarea rows={3} readOnly={isApproved} value={sheet.architecture} onChange={(e) => setSheet((s) => ({ ...s, architecture: e.target.value }))} /></label>
        <label>Surfaces / props <textarea rows={3} readOnly={isApproved} value={sheet.surfaces} onChange={(e) => setSheet((s) => ({ ...s, surfaces: e.target.value }))} /></label>
        <label>Lighting / color <textarea rows={3} readOnly={isApproved} value={sheet.lighting} onChange={(e) => setSheet((s) => ({ ...s, lighting: e.target.value }))} /></label>
        <label>Atmosphere <textarea rows={3} readOnly={isApproved} value={sheet.atmosphere} onChange={(e) => setSheet((s) => ({ ...s, atmosphere: e.target.value }))} /></label>
        <label>Continuity / must-not-change <textarea rows={3} readOnly={isApproved} value={sheet.continuity} onChange={(e) => setSheet((s) => ({ ...s, continuity: e.target.value }))} /></label>
        {!isApproved && <button disabled={working}>{working ? "Saving…" : "Save Environment Sheet"}</button>}
      </form>
      {!isApproved && (
        <button type="button" disabled={working} onClick={() => void handleApprove()}>
          {working ? "Approving…" : "Approve Environment"}
        </button>
      )}
      <h4>Environment Assets</h4>
      {!isApproved && (
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
      )}
      <AssetList assets={assets} working={working || isApproved} onApprove={(asset) => void onApproveAsset(asset)} />
    </article>
  );
}
