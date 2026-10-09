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
  // Preserve edits in other cards during background refreshes (such as uploads).
  // Reload this editor only when its own persisted version changes.
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
    <article>
      <h3>{character.name} {character.revision_number > 1 && <small>Revision {character.revision_number}</small>}</h3>
      {actionError && <p role="alert" className="form-error">{actionError}</p>}
      {actionStatus && <p role="status">{actionStatus}</p>}
      {suggestedFields.length > 0 && !locked && <p role="status">
        Confirmed World details suggested for: {suggestedFields.join(", ")}. Select Save Character Sheet to persist these draft suggestions.
      </p>}
      {missingFields.length > 0 && <p className="style-muted">
        {locked ? "Approved with unspecified fields (requires an explicit revision): " : "Not specified by confirmed World; creator input needed: "}
        {missingFields.join(", ")}.
      </p>}
      <form onSubmit={submit}>
        <label>Name <input readOnly={locked} value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Identity <textarea readOnly={locked} rows={3} value={sheet.identity} onChange={(e) => setSheet((s) => ({ ...s, identity: e.target.value }))} /></label>
        <label>Appearance <textarea readOnly={locked} rows={4} value={sheet.appearance} onChange={(e) => setSheet((s) => ({ ...s, appearance: e.target.value }))} /></label>
        <label>Wardrobe / props <textarea readOnly={locked} rows={3} value={sheet.wardrobe} onChange={(e) => setSheet((s) => ({ ...s, wardrobe: e.target.value }))} /></label>
        <label>Behavior / movement <textarea readOnly={locked} rows={3} value={sheet.behavior} onChange={(e) => setSheet((s) => ({ ...s, behavior: e.target.value }))} /></label>
        <label>Continuity / must-not-change <textarea readOnly={locked} rows={3} value={sheet.continuity} onChange={(e) => setSheet((s) => ({ ...s, continuity: e.target.value }))} /></label>
        <button disabled={working || locked}>{locked ? "Character Approved" : working ? "Saving…" : "Save Character Sheet"}</button>
      </form>
      <button type="button" disabled={working} onClick={() => {
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
      }}>{working ? "Generating…" : "Generate Character Description"}</button>
      {locked && generatedProposal && <section className="style-generated-proposal" aria-label="Generated character revision proposal">
        <h4>Generated revision proposal</h4>
        <p>The approved character was not changed. Create a revision before persisting this proposal.</p>
        {Object.entries(generatedProposal).map(([field, value]) => <div key={field}>
          <strong>{field.replace(/_/g, " ")}</strong><span>{value}</span>
        </div>)}
        <button type="button" disabled={working} onClick={() => {
          setActionError(null);
          void onCreateRevision(character, generatedProposal).catch((error: unknown) => {
            setActionError(getCreativeErrorMessage(error, "Unable to create character revision."));
          });
        }}>Create Revision from Proposal</button>
      </section>}
      <button type="button" disabled={working || character.status === "approved"} onClick={() => {
        setActionError(null);
        setActionStatus(null);
        void onApprove(character).then(() => {
          setActionStatus("Character approved.");
        }).catch((error: unknown) => {
          setActionError(getCreativeErrorMessage(error, "Unable to approve character."));
        });
      }}>{character.status === "approved" ? "Character Approved" : "Approve Character"}</button>
      <h4>Character Assets</h4>
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
      <AssetList assets={assets} onRefresh={onRefresh} working={working} onApprove={(asset) => {
        setActionError(null);
        void onApproveAsset(asset).catch((error: unknown) => {
          setActionError(getCreativeErrorMessage(error, "Unable to approve reference asset."));
        });
      }} />
    </article>
  );
}
