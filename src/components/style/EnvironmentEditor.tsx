import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Environment, EnvironmentAsset } from "../../types/style";
import AssetList from "./AssetList";
import { formatCreativeRecord, getCreativeErrorMessage } from "../../lib/formatCreativeText";
import { mergeGeneratedStyleDraft, pickGeneratedStyleDraft } from "../../lib/style/generatedStyleDraft";

const emptySheet = { purpose: "", layout: "", architecture: "", surfaces: "", lighting: "", atmosphere: "", continuity: "" };

export default function EnvironmentEditor({
  environment,
  assets,
  working,
  onSave,
  onUpload,
  onApproveAsset,
  onGenerate,
  onCreateRevision,
  onApprove,
  onRefresh,
}: {
  environment: Environment;
  assets: EnvironmentAsset[];
  working: boolean;
  onSave: (id: string, input: { name: string; sheet: Record<string, string> }) => Promise<unknown>;
  onUpload: (file: File, label: string) => Promise<unknown>;
  onApproveAsset: (asset: EnvironmentAsset) => Promise<unknown>;
  onGenerate: (environment: Environment) => Promise<Record<string, unknown>>;
  onCreateRevision: (environment: Environment, proposal: Record<string, string>) => Promise<unknown>;
  onRefresh?: () => Promise<unknown>;
  onApprove: (environment: Environment) => Promise<unknown>;
}) {
  const initial = useMemo(() => ({ ...emptySheet, ...formatCreativeRecord(environment.sheet) }), [environment.sheet]);
  const [name, setName] = useState(environment.name);
  const [sheet, setSheet] = useState(initial);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [generatedProposal, setGeneratedProposal] = useState<Record<string, string> | null>(null);
  const suggestedFields = environment.suggested_world_fields ?? [];
  const missingFields = Object.keys(emptySheet).filter((field) => !sheet[field as keyof typeof emptySheet]?.trim());
  const locked = environment.status === "approved";

  useEffect(() => {
    setName(environment.name);
    setSheet({ ...emptySheet, ...formatCreativeRecord(environment.sheet) });
    setActionError(null);
    setGeneratedProposal(null);
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

  return (
    <article className="style-record-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ margin: 0, fontSize: "20px" }}>
          {environment.name} {environment.revision_number > 1 && <small style={{ color: "var(--accent-gold)" }}>(Rev {environment.revision_number})</small>}
        </h3>
        <span className={`status-badge ${locked ? "status-approved" : "status-draft"}`}>
          {locked ? "APPROVED" : "DRAFT"}
        </span>
      </div>

      {actionError && <p role="alert" className="form-error">{actionError}</p>}
      {actionStatus && <p role="status" className="form-message">{actionStatus}</p>}
      {suggestedFields.length > 0 && !locked && (
        <p role="status" style={{ color: "var(--accent-gold)", fontSize: "12px", marginBottom: "12px" }}>
          World details suggested for: {suggestedFields.join(", ")}. Select Save Environment Sheet to persist.
        </p>
      )}
      {missingFields.length > 0 && (
        <p style={{ color: "var(--text-dim)", fontSize: "12px", marginBottom: "12px" }}>
          {locked ? "Approved with unspecified fields: " : "Unspecified fields: "}
          {missingFields.join(", ")}.
        </p>
      )}

      <form onSubmit={submit}>
        <label>Name <input readOnly={locked} value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Purpose / narrative role <textarea readOnly={locked} rows={3} value={sheet.purpose} onChange={(e) => setSheet((s) => ({ ...s, purpose: e.target.value }))} /></label>
        <label>Layout / composition <textarea readOnly={locked} rows={3} value={sheet.layout} onChange={(e) => setSheet((s) => ({ ...s, layout: e.target.value }))} /></label>
        <label>Architecture / structure <textarea readOnly={locked} rows={3} value={sheet.architecture} onChange={(e) => setSheet((s) => ({ ...s, architecture: e.target.value }))} /></label>
        <label>Surfaces / props <textarea readOnly={locked} rows={3} value={sheet.surfaces} onChange={(e) => setSheet((s) => ({ ...s, surfaces: e.target.value }))} /></label>
        <label>Lighting / color <textarea readOnly={locked} rows={3} value={sheet.lighting} onChange={(e) => setSheet((s) => ({ ...s, lighting: e.target.value }))} /></label>
        <label>Atmosphere <textarea readOnly={locked} rows={3} value={sheet.atmosphere} onChange={(e) => setSheet((s) => ({ ...s, atmosphere: e.target.value }))} /></label>
        <label>Continuity / must-not-change <textarea readOnly={locked} rows={3} value={sheet.continuity} onChange={(e) => setSheet((s) => ({ ...s, continuity: e.target.value }))} /></label>

        <div style={{ gridColumn: "1 / -1", display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
          <button className="primary-button" disabled={working || locked}>
            {locked ? "Environment Approved" : working ? "Saving…" : "Save Environment Sheet"}
          </button>

          <button
            type="button"
            className="secondary-button"
            disabled={working}
            onClick={() => {
              setActionError(null);
              setActionStatus(null);
              void onGenerate(environment).then((proposal) => {
                const picked = pickGeneratedStyleDraft(proposal, "environment");
                setGeneratedProposal(picked);
                if (locked) {
                  setActionStatus("Generated a revision proposal. The approved environment remains unchanged.");
                } else {
                  setSheet((current) => mergeGeneratedStyleDraft(current, proposal, "environment"));
                  setActionStatus("Generated missing environment descriptions. Review and save them to persist.");
                }
              }).catch((error: unknown) => {
                setActionError(getCreativeErrorMessage(error, "Unable to generate environment description."));
              });
            }}
          >
            {working ? "Generating…" : "Generate Environment Description"}
          </button>

          {!locked && (
            <button
              type="button"
              className="secondary-button"
              style={{ borderColor: "var(--color-success)", color: "var(--color-success)" }}
              disabled={working}
              onClick={() => {
                setActionError(null);
                setActionStatus(null);
                void onApprove(environment).then(() => {
                  setActionStatus("Environment approved.");
                }).catch((error: unknown) => {
                  setActionError(getCreativeErrorMessage(error, "Unable to approve environment."));
                });
              }}
            >
              Approve Environment
            </button>
          )}
        </div>
      </form>

      {locked && generatedProposal && (
        <section className="style-generated-proposal" aria-label="Generated environment revision proposal" style={{ marginTop: "20px", background: "var(--bg-surface-0)", padding: "16px", border: "1px solid var(--border-accent)", borderRadius: "8px" }}>
          <h4 style={{ color: "var(--accent-gold)", margin: "0 0 8px" }}>Generated revision proposal</h4>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
            The approved environment was not changed. Create a revision before persisting this proposal.
          </p>
          {Object.entries(generatedProposal).map(([field, value]) => (
            <div key={field} style={{ marginBottom: "8px" }}>
              <strong style={{ color: "#ffffff", fontSize: "12px", display: "block" }}>{field.replace(/_/g, " ")}:</strong>
              <span style={{ fontSize: "12px", color: "var(--text-main)" }}>{value}</span>
            </div>
          ))}
          <button
            type="button"
            className="primary-button"
            style={{ marginTop: "12px" }}
            disabled={working}
            onClick={() => {
              setActionError(null);
              void onCreateRevision(environment, generatedProposal).catch((error: unknown) => {
                setActionError(getCreativeErrorMessage(error, "Unable to create environment revision."));
              });
            }}
          >
            Create Revision from Proposal
          </button>
        </section>
      )}

      <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--border-subtle)" }}>
        <h4 style={{ fontSize: "14px", color: "#ffffff", marginBottom: "12px" }}>Environment Assets</h4>
        <input
          type="file"
          accept="image/*"
          disabled={working}
          style={{ marginBottom: "16px", fontSize: "12px" }}
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
        <AssetList assets={assets} onRefresh={onRefresh} working={working} onApprove={(asset) => {
          setActionError(null);
          void onApproveAsset(asset).catch((error: unknown) => {
            setActionError(getCreativeErrorMessage(error, "Unable to approve reference asset."));
          });
        }} />
      </div>
    </article>
  );
}
