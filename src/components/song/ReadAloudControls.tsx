import { useRef, useState } from "react";
import { useReadAloud } from "../../hooks/useReadAloud";

type Props = { summary: string; fullText: string };

export default function ReadAloudControls({ summary, fullText }: Props) {
  const speech = useReadAloud();
  const [section, setSection] = useState("summary");
  const [spokenText, setSpokenText] = useState("");
  const selectedBeforeClick = useRef("");
  function captureSelection() {
    if (typeof document === "undefined") return;
    const active = document.activeElement;
    selectedBeforeClick.current = (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)
      ? active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0).trim()
      : window.getSelection()?.toString().trim() || "";
  }

  function contentToRead() {
    if (section === "full") return fullText;
    if (section === "selected") return selectedBeforeClick.current;
    return summary;
  }

  if (!speech.supported) return <p role="status">Read Aloud is unavailable in this browser. The interpretation remains readable below.</p>;
  return (
    <div className="song-read-aloud" role="group" aria-label="Interpretation Read Aloud controls">
      <label>Read section
        <select value={section} onChange={(event) => setSection(event.target.value)}>
          <option value="summary">Summary</option>
          <option value="full">Entire interpretation</option>
          <option value="selected">Selected text</option>
        </select>
      </label>
      <label>Speech rate
        <select value={speech.rate} onChange={(event) => speech.setRate(Number(event.target.value))}>
          <option value="0.75">Slow</option><option value="1">Normal</option><option value="1.25">Faster</option>
        </select>
      </label>
      {speech.voices.length > 0 && <label>Voice
        <select value={speech.voiceUri} onChange={(event) => speech.setVoiceUri(event.target.value)}>
          <option value="">System default</option>
          {speech.voices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
        </select>
      </label>}
      <div className="song-intelligence-actions">
        <button type="button" className="secondary-button" onPointerDown={captureSelection} onClick={() => { const value = contentToRead(); setSpokenText(value); speech.play(value); }}>
          Read Aloud
        </button>
        <button type="button" className="secondary-button" disabled={speech.state !== "speaking"} onClick={speech.pause}>Pause</button>
        <button type="button" className="secondary-button" disabled={speech.state !== "paused"} onClick={speech.resume}>Resume</button>
        <button type="button" className="secondary-button" disabled={speech.state === "stopped"} onClick={speech.stop}>Stop</button>
      </div>
      <p role="status" aria-live="polite">Speech: {speech.state}</p>
      {spokenText && <details><summary>Spoken text</summary><p>{spokenText}</p></details>}
    </div>
  );
}
