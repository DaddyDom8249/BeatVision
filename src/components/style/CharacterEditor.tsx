import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Character, CharacterAsset } from "../../types/style";
import AssetList from "./AssetList";
import { formatCreativeRecord, getCreativeErrorMessage } from "../../lib/formatCreativeText";
import { mergeGeneratedStyleDraft, pickGeneratedStyleDraft } from "../../lib/style/generatedStyleDraft";

const emptySheet = { identity: "", appearance: "", wardrobe: "", behavior: "", continuity: "" };

export default function CharacterEditor({
  character,
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
  character: Character;
  assets: CharacterAsset[];
  working: boolean;
  onSave: (id: string, input: { name: string; sheet: Record<string, string> }) => Promise<unknown>;
  onUpload: (file: File, label: string) => Promise<unknown>;
  onApproveAsset: (asset: CharacterAsset) => Promise<unknown>;
  onGenerate: (character: Character) => Promise<Record<string, unknown>>;
  onCreateRevision: (character: Character, proposal: Record<string, string>) => Promise<unknown>;
  onRefresh?: () => Promise<unknown>;
  onApprove: (character: Character) => Promise<unknown>;
}) {
  const initial = useMemo(() => ({ ...emptySheet, ...formatCreativeRecord(character.sheet) }), [character.sheet]);
  const [name, setName] = useState(character.name);
  const [sheet, setSheet] = useState(initial);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [generatedProposal, setGeneratedProposal] = useState<Record<string, string> | null>(null);
  const suggestedFields = character.suggested_world_fields ?? [];
  const missingFields = Object.keys(emptySheet).filter((field) => !sheet[field as keyof typeof emptySheet]?.trim());
  const locked = character.status === "approved";

  useEffect(() => {
    setName(character.name);
    setSheet({ ...emptySheet, ...formatCreativeRecord(character.sheet) });
    setActionError(null);
    setGeneratedProposal(null);
  }, [character.id, character.updated_at, character.status]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    setActionError(null);
    setActionStatus(null);
    void onSave(character.id, { name, sheet }).then(() => {
      setActionStatus("Saved character sheet.");
    }).catch((error: unknown) => {
      setActionError(getCreativeErrorMessage(error, "Unable to save character."));
    });
  }

  return (
    <article className="style-record-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ margin: 0, fontSize: "20px" }}>
          {character.name} {character.revision_number > 1 && <small style={{ color: "var(--accent-gold)" }}>(Rev {character.revision_number})</small>}
        </h3>
        <span className={`status-badge ${locked ? "status-approved" : "status-draft"}`}>
          {locked ? "APPROVED" : "DRAFT"}
        </span>
      </div>

      {actionError && <p role="alert" className="form-error">{actionError}</p>}
      {actionStatus && <p role="status" className="form-message">{actionStatus}</p>}
      {suggestedFields.length > 0 && !locked && (
        <p role="status" style={{ color: "var(--accent-gold)", fontSize: "12px", marginBottom: "12px" }}>
          World details suggested for: {suggestedFields.join(", ")}. Select Save Character Sheet to persist.
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
        <label>Identity <textarea readOnly={locked} rows={3} value={sheet.identity} onChange={(e) => setSheet((s) => ({ ...s, identity: e.target.value }))} /></label>
        <label>Appearance <textarea readOnly={locked} rows={4} value={sheet.appearance} onChange={(e) => setSheet((s) => ({ ...s, appearance: e.target.value }))} /></label>
        <label>Wardrobe / props <textarea readOnly={locked} rows={3} value={sheet.wardrobe} onChange={(e) => setSheet((s) => ({ ...s, wardrobe: e.target.value }))} /></label>
        <label>Behavior / movement <textarea readOnly={locked} rows={3} value={sheet.behavior} onChange={(e) => setSheet((s) => ({ ...s, behavior: e.target.value }))} /></label>
        <label>Continuity / must-not-change <textarea readOnly={locked} rows={3} value={sheet.continuity} onChange={(e) => setSheet((s) => ({ ...s, continuity: e.target.value }))} /></label>

        <div style={{ gridColumn: "1 / -1", display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
          <button className="primary-button" disabled={working || locked}>
            {locked ? "Character Approved" : working ? "Saving…" : "Save Character Sheet"}
          </button>

          <button
            type="button"
            className="secondary-button"
            disabled={working}
            onClick={() => {
              setActionError(null);
              setActionStatus(null);
              void onGenerate(character).then((proposal) => {
                const picked = pickGeneratedStyleDraft(proposal, "character");
                setGeneratedProposal(picked);
                if (locked) {
                  setActionStatus("Generated a revision proposal. The approved character remains unchanged.");
                } else {
                  setSheet((current) => mergeGeneratedStyleDraft(current, proposal, "character"));
                  setActionStatus("Generated missing character descriptions. Review and save them to persist.");
                }
              }).catch((error: unknown) => {
                setActionError(getCreativeErrorMessage(error, "Unable to generate character description."));
              });
            }}
          >
            {working ? "Generating…" : "Generate Character Description"}
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
                void onApprove(character).then(() => {
                  setActionStatus("Character approved.");
                }).catch((error: unknown) => {
                  setActionError(getCreativeErrorMessage(error, "Unable to approve character."));
                });
              }}
            >
              Approve Character
            </button>
          )}
        </div>
      </form>

      {locked && generatedProposal && (
        <section className="style-generated-proposal" aria-label="Generated character revision proposal" style={{ marginTop: "20px", background: "var(--bg-surface-0)", padding: "16px", border: "1px solid var(--border-accent)", borderRadius: "8px" }}>
          <h4 style={{ color: "var(--accent-gold)", margin: "0 0 8px" }}>Generated revision proposal</h4>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
            The approved character was not changed. Create a revision before persisting this proposal.
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
              void onCreateRevision(character, generatedProposal).catch((error: unknown) => {
                setActionError(getCreativeErrorMessage(error, "Unable to create character revision."));
              });
            }}
          >
            Create Revision from Proposal
          </button>
        </section>
      )}

      <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--border-subtle)" }}>
        <h4 style={{ fontSize: "14px", color: "#ffffff", marginBottom: "12px" }}>Character Assets</h4>
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
