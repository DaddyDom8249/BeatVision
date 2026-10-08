import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Environment, EnvironmentAsset } from "../../types/style";
import AssetList from "./AssetList";
import { formatCreativeRecord, getCreativeErrorMessage } from "../../lib/formatCreativeText";

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
  const [actionError, setActionError] = useState<string | null>(null);
  const locked = environment.status === "approved";

  useEffect(() => {
    setName(environment.name);
    setSheet({ ...emptySheet, ...formatCreativeRecord(environment.sheet) });
    setActionError(null);
  }, [environment]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    setActionError(null);
    void onSave(environment.id, { name, sheet }).catch((error: unknown) => {
      setActionError(getCreativeErrorMessage(error, "Unable to save environment."));
    });
  }

  return (
    <article>
      <h3>{environment.name}</h3>
      {actionError && <p role="alert" className="form-error">{actionError}</p>}
      <form onSubmit={submit}>
        <label>Name <input readOnly={locked} value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Purpose / narrative role <textarea readOnly={locked} rows={3} value={sheet.purpose} onChange={(e) => setSheet((s) => ({ ...s, purpose: e.target.value }))} /></label>
        <label>Layout / composition <textarea readOnly={locked} rows={3} value={sheet.layout} onChange={(e) => setSheet((s) => ({ ...s, layout: e.target.value }))} /></label>
        <label>Architecture / structure <textarea readOnly={locked} rows={3} value={sheet.architecture} onChange={(e) => setSheet((s) => ({ ...s, architecture: e.target.value }))} /></label>
        <label>Surfaces / props <textarea readOnly={locked} rows={3} value={sheet.surfaces} onChange={(e) => setSheet((s) => ({ ...s, surfaces: e.target.value }))} /></label>
        <label>Lighting / color <textarea readOnly={locked} rows={3} value={sheet.lighting} onChange={(e) => setSheet((s) => ({ ...s, lighting: e.target.value }))} /></label>
        <label>Atmosphere <textarea readOnly={locked} rows={3} value={sheet.atmosphere} onChange={(e) => setSheet((s) => ({ ...s, atmosphere: e.target.value }))} /></label>
        <label>Continuity / must-not-change <textarea readOnly={locked} rows={3} value={sheet.continuity} onChange={(e) => setSheet((s) => ({ ...s, continuity: e.target.value }))} /></label>
        <button disabled={working || locked}>{locked ? "Environment Approved" : working ? "Saving…" : "Save Environment Sheet"}</button>
      </form>
      <button type="button" disabled={working || environment.status === "approved"} onClick={() => {
        setActionError(null);
        void onApprove(environment).catch((error: unknown) => {
          setActionError(getCreativeErrorMessage(error, "Unable to approve environment."));
        });
      }}>{environment.status === "approved" ? "Environment Approved" : "Approve Environment"}</button>
      <h4>Environment Assets</h4>
      <input
        type="file"
        accept="image/*"
        disabled={working}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onUpload(file, file.name).catch((error: unknown) => {
            setActionError(getCreativeErrorMessage(error, "Unable to upload asset."));
          });
          event.currentTarget.value = "";
        }}
      />
      <AssetList assets={assets} working={working} onApprove={(asset) => void onApproveAsset(asset)} />
    </article>
  );
}
