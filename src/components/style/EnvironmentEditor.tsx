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

  useEffect(() => {
    setName(environment.name);
    setSheet({ ...emptySheet, ...formatCreativeRecord(environment.sheet) });
    setActionError(null);
    setGeneratedProposal(null);
  // Preserve edits in other cards during background refreshes (such as uploads).
  // Reload this editor only when its own persisted version changes.
  }, [environment.id, environment.updated_at, environment.status]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setActionError(null);
    setActionStatus(null);
    void onSave(environment.id, { name, sheet }).then(() => {
      setActionStatus("Saved environment sheet.");
    }).catch((error: unknown) => {
      setActionError(getCreativeErrorMessage(error, "Unable to save environment."));
    });
  }

  return (
    <article>
      <h3>{environment.name} {environment.revision_number > 1 && <small>Revision {environment.revision_number}</small>}</h3>
      {actionError && <p role="alert" className="form-error">{actionError}</p>}
      {actionStatus && <p role="status" className="form-status">{actionStatus}</p>}
      {suggestedFields.length > 0 && environment.status !== "approved" && <p role="status">
        Confirmed World details suggested for: {suggestedFields.join(", ")}. Select Save Environment Sheet to persist these draft suggestions.
      </p>}
      {missingFields.length > 0 && <p className="style-muted">
        {environment.status === "approved" ? "Approved with unspecified fields (requires an explicit revision): " : "Not specified by confirmed World; creator input needed: "}
        {missingFields.join(", ")}.
      </p>}
      <form onSubmit={submit}>
        <label>Name <input readOnly={environment.status === "approved"} value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Purpose / narrative role <textarea readOnly={environment.status === "approved"} rows={3} value={sheet.purpose} onChange={(e) => setSheet((s) => ({ ...s, purpose: e.target.value }))} /></label>
        <label>Layout / composition <textarea readOnly={environment.status === "approved"} rows={3} value={sheet.layout} onChange={(e) => setSheet((s) => ({ ...s, layout: e.target.value }))} /></label>
        <label>Architecture / structure <textarea readOnly={environment.status === "approved"} rows={3} value={sheet.architecture} onChange={(e) => setSheet((s) => ({ ...s, architecture: e.target.value }))} /></label>
        <label>Surfaces / props <textarea readOnly={environment.status === "approved"} rows={3} value={sheet.surfaces} onChange={(e) => setSheet((s) => ({ ...s, surfaces: e.target.value }))} /></label>
        <label>Lighting / color <textarea readOnly={environment.status === "approved"} rows={3} value={sheet.lighting} onChange={(e) => setSheet((s) => ({ ...s, lighting: e.target.value }))} /></label>
        <label>Atmosphere <textarea readOnly={environment.status === "approved"} rows={3} value={sheet.atmosphere} onChange={(e) => setSheet((s) => ({ ...s, atmosphere: e.target.value }))} /></label>
        <label>Continuity / must-not-change <textarea readOnly={environment.status === "approved"} rows={3} value={sheet.continuity} onChange={(e) => setSheet((s) => ({ ...s, continuity: e.target.value }))} /></label>
        {environment.status !== "approved" && <button disabled={working}>{working ? "Saving…" : "Save Environment Sheet"}</button>}
      </form>
      <button type="button" disabled={working} onClick={() => {
        setActionError(null);
        setActionStatus(null);
        void onGenerate(environment).then((proposal) => {
          const picked = pickGeneratedStyleDraft(proposal, "environment");
          setGeneratedProposal(picked);
          if (environment.status === "approved") {
            setActionStatus("Generated a revision proposal. The approved environment remains unchanged.");
          } else {
            setSheet((current) => mergeGeneratedStyleDraft(current, proposal, "environment"));
            setActionStatus("Generated missing environment descriptions. Review and save them to persist.");
          }
        }).catch((error: unknown) => {
          setActionError(getCreativeErrorMessage(error, "Unable to generate environment description."));
        });
      }}>{working ? "Generating…" : "Generate Environment Description"}</button>
      {environment.status === "approved" && generatedProposal && <section className="style-generated-proposal" aria-label="Generated environment revision proposal">
        <h4>Generated revision proposal</h4>
        <p>The approved environment was not changed. Create a revision before persisting this proposal.</p>
        {Object.entries(generatedProposal).map(([field, value]) => <div key={field}>
          <strong>{field.replace(/_/g, " ")}</strong><span>{value}</span>
        </div>)}
        <button type="button" disabled={working} onClick={() => {
          setActionError(null);
          void onCreateRevision(environment, generatedProposal).catch((error: unknown) => {
            setActionError(getCreativeErrorMessage(error, "Unable to create environment revision."));
          });
        }}>Create Revision from Proposal</button>
      </section>}
      <button type="button" disabled={working || environment.status === "approved"} onClick={() => {
        setActionError(null);
        setActionStatus(null);
        void onApprove(environment).then(() => {
          setActionStatus("Environment approved.");
        }).catch((error: unknown) => {
          setActionError(getCreativeErrorMessage(error, "Unable to approve environment."));
        });
      }}>{environment.status === "approved" ? "Environment Approved" : "Approve Environment"}</button>
      <h4>Environment Assets</h4>
      {environment.status !== "approved" && (
        <input
          type="file"
          accept="image/*"
          disabled={working}
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
      <AssetList assets={assets} onRefresh={onRefresh} working={working || environment.status === "approved"} onApprove={(asset) => {
        setActionError(null);
        void onApproveAsset(asset).catch((error: unknown) => {
          setActionError(getCreativeErrorMessage(error, "Unable to approve reference asset."));
        });
      }} />
    </article>
  );
}
