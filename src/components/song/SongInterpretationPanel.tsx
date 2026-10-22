import { useEffect, useMemo, useState } from "react";
import type { Song, SongInterpretationDraft, SongInterpretationEvidence } from "../../types/song";
import SongDirectorChat from "./SongDirectorChat";
import ReadAloudControls from "./ReadAloudControls";

type Props = {
  song: Song | null;
  loading: boolean;
  working: boolean;
  error: string | null;
  manualFallback: boolean;
  latestDraft: SongInterpretationDraft | null;
  confirmed: SongInterpretationDraft | null;
  saveDraft: (input: { interpretation: Record<string, unknown>; evidence: SongInterpretationEvidence[] }, sourceType?: "manual" | "artist_edited") => Promise<SongInterpretationDraft | null>;
  propose: () => Promise<SongInterpretationDraft | null>;
  confirm: (id: string) => Promise<SongInterpretationDraft | null>;
  onConfirmed?: () => Promise<unknown>;
  songIntakeDirty?: boolean;
};

function listText(value: unknown) {
  return Array.isArray(value) ? value.map(String).join("\n") : "";
}

export default function SongInterpretationPanel({ song, loading, working, error, manualFallback, latestDraft, confirmed, saveDraft, propose, confirm, onConfirmed, songIntakeDirty = false }: Props) {
  const [summary, setSummary] = useState("");
  const [themes, setThemes] = useState("");
  const [emotionalArc, setEmotionalArc] = useState("");
  const [visualMotifs, setVisualMotifs] = useState("");
  const [narrative, setNarrative] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const activeDraft = latestDraft ?? confirmed;

  useEffect(() => {
    if (!activeDraft) return;
    const document = activeDraft.interpretation;
    setSummary(document?.summary ?? "");
    setThemes(listText(document?.themes));
    setEmotionalArc(document?.emotional_arc ?? "");
    setVisualMotifs(listText(document?.visual_motifs));
    setNarrative(document?.narrative ?? "");
    setEvidenceText((activeDraft.evidence ?? []).map((item) => item.excerpt || item.reference).filter(Boolean).join("\n"));
  }, [activeDraft?.id]);

  const evidence = useMemo(() => evidenceText.split(/\r?\n/).map((excerpt, index) => excerpt.trim() ? ({
    id: `artist.note.${index + 1}`,
    kind: "artist" as const,
    reference: "artist_song_intake_note",
    excerpt: excerpt.trim().slice(0, 800),
  }) : null).filter(Boolean) as SongInterpretationEvidence[], [evidenceText]);

  async function save(sourceType: "manual" | "artist_edited" = "manual") {
    setSavedMessage(null);
    if (songIntakeDirty) { setSavedMessage("Save song details before updating the interpretation."); return; }
    const result = await saveDraft({
      interpretation: { summary, themes, emotional_arc: emotionalArc, visual_motifs: visualMotifs, narrative },
      evidence,
    }, sourceType);
    if (result) setSavedMessage(`Draft v${result.version} saved. Review it, then explicitly confirm it.`);
  }

  const editorSnapshot = JSON.stringify([summary, themes, emotionalArc, visualMotifs, narrative, evidenceText]);
  const persisted = latestDraft?.interpretation;
  const persistedSnapshot = latestDraft ? JSON.stringify([
    persisted?.summary ?? "", listText(persisted?.themes), persisted?.emotional_arc ?? "",
    listText(persisted?.visual_motifs), persisted?.narrative ?? "",
    (latestDraft.evidence ?? []).map((item) => item.excerpt || item.reference).filter(Boolean).join("\n"),
  ]) : "";
  const hasUnsavedEdits = Boolean(latestDraft) && editorSnapshot !== persistedSnapshot;

  async function confirmDraft() {
    if (!latestDraft || hasUnsavedEdits || songIntakeDirty) {
      setSavedMessage("Save the displayed edits as a new draft before confirming.");
      return;
    }
    const result = await confirm(latestDraft.id);
    if (result) {
      setSavedMessage("Interpretation confirmed by the artist. World Reveal can now use this exact lineage.");
      await onConfirmed?.();
    }
  }

  const signal = song?.analysis;
  return (
    <section className="song-intelligence-panel" aria-labelledby="song-intelligence-title">
      <div className="song-intelligence-heading">
        <div>
          <div className="eyebrow">SONG INTAKE NOTES / INTELLIGENCE</div>
          <h2 id="song-intelligence-title">Interpret the song before revealing its World</h2>
        </div>
        <span className={confirmed ? "status-badge status-approved" : "status-badge status-draft"}>
          {confirmed ? "ARTIST CONFIRMED" : latestDraft ? `DRAFT V${latestDraft.version}` : "MANUAL FALLBACK READY"}
        </span>
      </div>
      <p className="song-intelligence-copy">
        This interpretation is separate from your Notes and never replaces them. Measured duration and tempo/key estimates are shown as evidence; creative meaning stays editable and requires explicit artist confirmation.
      </p>

      <div className="analysis-dashboard-grid song-intelligence-evidence" aria-label="Song evidence and estimates">
        <div className="analysis-metric-card"><span className="metric-label">Audio source</span><span className="metric-value">{song?.audio_path ? "Saved privately" : "Required"}</span></div>
        <div className="analysis-metric-card"><span className="metric-label">Duration</span><span className="metric-value">{signal?.duration_seconds ? `${Number(signal.duration_seconds).toFixed(1)}s` : "Unavailable"}</span></div>
        <div className="analysis-metric-card"><span className="metric-label">BPM / key estimates</span><span className="metric-value">{signal?.bpm ?? "—"} / {signal?.key ?? "—"}</span></div>
        <div className="analysis-metric-card"><span className="metric-label">Source fingerprint</span><span className="metric-value fingerprint-value">{song?.audio_source_fingerprint ? `${song.audio_source_fingerprint.slice(0, 12)}…` : "Computed on save"}</span></div>
      </div>

      {loading && <p className="form-message" role="status">Loading interpretation history…</p>}
      <div className="song-intelligence-fields">
        <label>Interpretation summary<textarea rows={5} value={summary} disabled={working} onChange={(event) => setSummary(event.target.value)} placeholder="What is this song expressing, based on the lyrics, signal, and your direction?" /></label>
        <label>Themes <span className="field-hint">One per line</span><textarea rows={3} value={themes} disabled={working} onChange={(event) => setThemes(event.target.value)} placeholder="Longing\nDefiance" /></label>
        <label>Emotional arc<textarea rows={3} value={emotionalArc} disabled={working} onChange={(event) => setEmotionalArc(event.target.value)} placeholder="Describe the emotional movement without inventing unsupported events." /></label>
        <label>Visual motifs <span className="field-hint">One per line</span><textarea rows={3} value={visualMotifs} disabled={working} onChange={(event) => setVisualMotifs(event.target.value)} placeholder="Rain on glass\nA narrowing corridor" /></label>
        <label>Narrative context<textarea rows={3} value={narrative} disabled={working} onChange={(event) => setNarrative(event.target.value)} placeholder="Optional narrative context for later World and scene direction." /></label>
        <label>Evidence / rationale <span className="field-hint">Quote or reference the lyric, signal, or your own direction</span><textarea rows={4} value={evidenceText} disabled={working} onChange={(event) => setEvidenceText(event.target.value)} placeholder="One evidence note per line" /></label>
      </div>

      <div className="song-intelligence-actions">
        <button type="button" className="secondary-button" disabled={working || songIntakeDirty || !song?.audio_path} onClick={() => void propose()}>{working ? "Working…" : "Propose AI Interpretation"}</button>
        <button type="button" className="secondary-button" disabled={working || songIntakeDirty || !song?.audio_path || !summary.trim()} onClick={() => void save(latestDraft ? "artist_edited" : "manual")}>Save Manual Draft</button>
        <button type="button" className="primary-button" disabled={working || songIntakeDirty || !latestDraft || hasUnsavedEdits} onClick={() => void confirmDraft()}>Confirm Interpretation</button>
      </div>

      <ReadAloudControls summary={summary} fullText={[summary, themes, emotionalArc, visualMotifs, narrative, evidenceText].filter(Boolean).join(". ")} />
      {songIntakeDirty && <p role="status">Save all song, lyric, and Notes edits before confirming or regenerating this interpretation.</p>}
      {hasUnsavedEdits && <p role="status">You have unsaved interpretation edits. Save a new draft before confirming.</p>}
      {manualFallback && <p className="form-message" role="status">AI inference is blocked until a no-charge provider is verified. Manual interpretation and saved drafts remain available.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {savedMessage && <p className="form-message" role="status">{savedMessage}</p>}
      {confirmed && <p className="song-intelligence-confirmation" role="status">Confirmed v{confirmed.version} is the only interpretation eligible for new World Reveal lineage. Earlier versions remain in audit history.</p>}
      <SongDirectorChat song={song} confirmed={confirmed} />
    </section>
  );
}
