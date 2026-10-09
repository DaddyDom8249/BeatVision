import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatCreativeRecord } from "../../lib/formatCreativeText";
import type { Character, CharacterAsset } from "../../types/style";
import AssetList from "./AssetList";

const emptySheet = { identity: "", appearance: "", wardrobe: "", behavior: "", continuity: "" };

export default function CharacterEditor({
  character,
  assets,
  working,
  onSave,
  onGenerate,
  onUpload,
  onApproveAsset,
  onApprove,
}: {
  character: Character;
  assets: CharacterAsset[];
  working: boolean;
  onSave: (id: string, input: { name: string; sheet: Record<string, string> }) => Promise<unknown>;
  onGenerate?: (character: Character) => Promise<unknown>;
  onUpload: (file: File, label: string) => Promise<unknown>;
  onApproveAsset: (asset: CharacterAsset) => Promise<unknown>;
  onApprove: (character: Character) => Promise<unknown>;
}) {
  const initial = useMemo(() => ({ ...emptySheet, ...formatCreativeRecord(character.sheet) }), [character.sheet]);
  const [name, setName] = useState(character.name);
  const [sheet, setSheet] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setName(character.name);
    setSheet({ ...emptySheet, ...formatCreativeRecord(character.sheet) });
    setError(null);
  }, [character]);

  const isApproved = character.status === "approved";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isApproved) return;
    setError(null);
    try {
      await onSave(character.id, { name, sheet });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleGenerate() {
    if (isApproved || !onGenerate) return;
    setError(null);
    setGenerating(true);
    try {
      await onGenerate(character);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove() {
    if (isApproved) return;
    setError(null);
    try {
      await onApprove(character);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <article className="character-editor-card">
      <div className="character-card-header">
        <h3>{character.name}</h3>
        <span className={`status-badge ${character.status}`}>{isApproved ? "APPROVED" : "DRAFT"}</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form onSubmit={submit}>
        <label>Name <input value={name} readOnly={isApproved} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Identity <textarea rows={3} readOnly={isApproved} value={sheet.identity} onChange={(e) => setSheet((s) => ({ ...s, identity: e.target.value }))} /></label>
        <label>Appearance <textarea rows={4} readOnly={isApproved} value={sheet.appearance} onChange={(e) => setSheet((s) => ({ ...s, appearance: e.target.value }))} /></label>
        <label>Wardrobe / props <textarea rows={3} readOnly={isApproved} value={sheet.wardrobe} onChange={(e) => setSheet((s) => ({ ...s, wardrobe: e.target.value }))} /></label>
        <label>Behavior / movement <textarea rows={3} readOnly={isApproved} value={sheet.behavior} onChange={(e) => setSheet((s) => ({ ...s, behavior: e.target.value }))} /></label>
        <label>Continuity / must-not-change <textarea rows={3} readOnly={isApproved} value={sheet.continuity} onChange={(e) => setSheet((s) => ({ ...s, continuity: e.target.value }))} /></label>
        {!isApproved && (
          <div className="card-actions">
            <button disabled={working || generating}>{working ? "Saving…" : "Save Character Sheet"}</button>
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
      {!isApproved && (
        <button type="button" disabled={working || generating} onClick={() => void handleApprove()}>
          {working ? "Approving…" : "Approve Character"}
        </button>
      )}
      <h4>Character Assets</h4>
      {!isApproved && (
        <input
          type="file"
          accept="image/*"
          disabled={working || generating}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onUpload(file, file.name);
            event.currentTarget.value = "";
          }}
        />
      )}
      <AssetList assets={assets} working={working || isApproved || generating} onApprove={(asset) => void onApproveAsset(asset)} />
    </article>
  );
}
