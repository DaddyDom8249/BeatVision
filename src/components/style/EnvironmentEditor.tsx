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
  onGenerate,
  onUpload,
  onApproveAsset,
  onApprove,
  onRefresh,
}: {
  environment: Environment;
  assets: EnvironmentAsset[];
  working: boolean;
  onSave: (id: string, input: { name: string; sheet: Record<string, string> }) => Promise<unknown>;
  onGenerate?: (environment: Environment) => Promise<unknown>;
  onUpload: (file: File, label: string) => Promise<unknown>;
  onApproveAsset: (asset: EnvironmentAsset) => Promise<unknown>;
  onRefresh?: () => Promise<unknown>;
  onApprove: (environment: Environment) => Promise<unknown>;
}) {
  const initial = useMemo(() => ({ ...emptySheet, ...formatCreativeRecord(environment.sheet) }), [environment.sheet]);
  const [name, setName] = useState(environment.name);
  const [sheet, setSheet] = useState(initial);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const suggestedFields = environment.suggested_world_fields ?? [];
  const missingFields = Object.keys(emptySheet).filter((field) => !sheet[field as keyof typeof emptySheet]?.trim());
  const locked = environment.status === "approved";

  useEffect(() => {
    setName(environment.name);
    setSheet({ ...emptySheet, ...formatCreativeRecord(environment.sheet) });
    setActionError(null);
  // Preserve edits in other cards during background refreshes (such as uploads).
  // Reload this editor only when its own persisted version changes.
  }, [environment.id, environment.updated_at, environment.status]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    setActionError(null);
    setActionStatus(null);
    void onSave(environment.id, { name, sheet }).then(() => {
      setActionStatus("Saved environment sheet.");
    }).catch((error: unknown) => {
      setActionError(getCreativeErrorMessage(error, "Unable to save environment."));
    });
  }

  async function handleGenerate() {
    if (locked || !onGenerate) return;
    setActionError(null);
    setActionStatus(null);
    setGenerating(true);
    try {
      await onGenerate(environment);
      setActionStatus("Generated AI environment description draft.");
    } catch (e) {
      setActionError(getCreativeErrorMessage(e, "Unable to generate environment description."));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <article className="environment-editor-card">
      <div className="character-card-header">
        <h3>{environment.name}</h3>
        <span className={`status-badge ${environment.status}`}>{locked ? "APPROVED" : "DRAFT"}</span>
      </div>
      {actionError && <p role="alert" className="form-error">{actionError}</p>}
      {actionStatus && <p role="status" className="form-status">{actionStatus}</p>}
      {suggestedFields.length > 0 && !locked && <p role="status">
        Confirmed World details suggested for: {suggestedFields.join(", ")}. Select Save Environment Sheet to persist these draft suggestions.
      </p>}
      {missingFields.length > 0 && <p className="style-muted">
        {locked ? "Approved with unspecified fields (requires an explicit revision): " : "Not specified by confirmed World; creator input needed: "}
        {missingFields.join(", ")}.
      </p>}
      <form onSubmit={submit}>
        <label>Name <input readOnly={locked} value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Purpose / narrative role <textarea readOnly={locked} rows={3} value={sheet.purpose} onChange={(e) => setSheet((s) => ({ ...s, purpose: e.target.value }))} /></label>
        <label>Layout / composition <textarea readOnly={locked} rows={3} value={sheet.layout} onChange={(e) => setSheet((s) => ({ ...s, layout: e.target.value }))} /></label>
        <label>Architecture / structure <textarea readOnly={locked} rows={3} value={sheet.architecture} onChange={(e) => setSheet((s) => ({ ...s, architecture: e.target.value }))} /></label>
        <label>Surfaces / props <textarea readOnly={locked} rows={3} value={sheet.surfaces} onChange={(e) => setSheet((s) => ({ ...s, surfaces: e.target.value }))} /></label>
        <label>Lighting / color <textarea readOnly={locked} rows={3} value={sheet.lighting} onChange={(e) => setSheet((s) => ({ ...s, lighting: e.target.value }))} /></label>
        <label>Atmosphere <textarea readOnly={locked} rows={3} value={sheet.atmosphere} onChange={(e) => setSheet((s) => ({ ...s, atmosphere: e.target.value }))} /></label>
        <label>Continuity / must-not-change <textarea readOnly={locked} rows={3} value={sheet.continuity} onChange={(e) => setSheet((s) => ({ ...s, continuity: e.target.value }))} /></label>
        {!locked && (
          <div className="card-actions">
            <button disabled={working || generating}>{working ? "Saving…" : "Save Environment Sheet"}</button>
            {onGenerate && (
              <button
                type="button"
                className="secondary"
                disabled={working || generating}
                onClick={() => void handleGenerate()}
              >
                {generating ? "Generating AI Draft…" : "Generate AI Description"}
              </button>
            )}
          </div>
        )}
      </form>
      {!locked && (
        <button type="button" disabled={working || generating} onClick={() => {
          setActionError(null);
          setActionStatus(null);
          void onApprove(environment).then(() => {
            setActionStatus("Environment approved.");
          }).catch((error: unknown) => {
            setActionError(getCreativeErrorMessage(error, "Unable to approve environment."));
          });
        }}>Approve Environment</button>
      )}
      <h4>Environment Assets</h4>
      {!locked && (
        <input
          type="file"
          accept="image/*"
          disabled={working || generating}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              setActionError(null);
              setActionStatus(null);
              void onUpload(file, file.name).then(() => {
                setActionStatus("Reference image uploaded.");
              }).catch((error: unknown) => {
                setActionError(getCreativeErrorMessage(error, "Unable to upload asset."));
              });
            }
            event.currentTarget.value = "";
          }}
        />
      )}
      <AssetList assets={assets} onRefresh={onRefresh} working={working || locked || generating} onApprove={(asset) => {
        setActionError(null);
        void onApproveAsset(asset).catch((error: unknown) => {
          setActionError(getCreativeErrorMessage(error, "Unable to approve reference asset."));
        });
      }} />
    </article>
  );
}
