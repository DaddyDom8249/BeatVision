import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Character, CharacterAsset } from "../../types/style";
import AssetList from "./AssetList";

const emptySheet = { identity: "", appearance: "", wardrobe: "", behavior: "", continuity: "" };

export default function CharacterEditor({
  character,
  assets,
  working,
  onSave,
  onUpload,
  onApproveAsset,
}: {
  character: Character;
  assets: CharacterAsset[];
  working: boolean;
  onSave: (id: string, input: { name: string; sheet: Record<string, string> }) => Promise<unknown>;
  onUpload: (file: File, label: string) => Promise<unknown>;
  onApproveAsset: (asset: CharacterAsset) => Promise<unknown>;
}) {
  const initial = useMemo(() => ({ ...emptySheet, ...character.sheet }), [character.sheet]);
  const [name, setName] = useState(character.name);
  const [sheet, setSheet] = useState(initial);

  useEffect(() => {
    setName(character.name);
    setSheet({ ...emptySheet, ...character.sheet });
  }, [character]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void onSave(character.id, { name, sheet });
  }

  return (
    <article>
      <h3>{character.name}</h3>
      <form onSubmit={submit}>
        <label>Name <input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Identity <textarea rows={3} value={sheet.identity} onChange={(e) => setSheet((s) => ({ ...s, identity: e.target.value }))} /></label>
        <label>Appearance <textarea rows={4} value={sheet.appearance} onChange={(e) => setSheet((s) => ({ ...s, appearance: e.target.value }))} /></label>
        <label>Wardrobe / props <textarea rows={3} value={sheet.wardrobe} onChange={(e) => setSheet((s) => ({ ...s, wardrobe: e.target.value }))} /></label>
        <label>Behavior / movement <textarea rows={3} value={sheet.behavior} onChange={(e) => setSheet((s) => ({ ...s, behavior: e.target.value }))} /></label>
        <label>Continuity / must-not-change <textarea rows={3} value={sheet.continuity} onChange={(e) => setSheet((s) => ({ ...s, continuity: e.target.value }))} /></label>
        <button disabled={working}>{working ? "Saving…" : "Save Character Sheet"}</button>
      </form>
      <h4>Character Assets</h4>
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
