import { useState } from "react";
import type { Song, SongInterpretationDraft } from "../../types/song";
import { useDirectorChat } from "../../hooks/useDirectorChat";

export default function SongDirectorChat({ song, confirmed }: { song: Song | null; confirmed: SongInterpretationDraft | null }) {
  const [question, setQuestion] = useState("");
  const { messages, working, error, blocked, gated, ask } = useDirectorChat(song, confirmed);

  async function send() {
    if (!question.trim()) return;
    const current = question;
    setQuestion("");
    await ask(current);
  }

  return (
    <section className="song-director-chat" aria-labelledby="song-director-title">
      <div className="song-intelligence-heading">
        <div>
          <div className="eyebrow">BRAGORA AI DIRECTOR</div>
          <h3 id="song-director-title">Ask about the confirmed direction</h3>
        </div>
        <span className={gated ? "status-badge status-approved" : "status-badge status-draft"}>{gated ? "LINEAGE LOCKED" : "GATED"}</span>
      </div>
      {!gated ? (
        <p className="song-intelligence-copy">Confirm an interpretation above before opening a Director conversation. The Director can only use the current confirmed song lineage.</p>
      ) : (
        <>
          <p className="song-intelligence-copy">Questions are sent only to a separately verified no-charge provider. The Director proposes; the artist remains the authority.</p>
          {messages.length > 0 && (
            <div className="song-director-transcript" role="log" aria-live="polite">
              {messages.map((message, index) => (
                <div className={`song-director-message ${message.role}`} key={`${message.role}-${index}`}>
                  <span className="song-director-speaker">{message.role === "artist" ? "Artist" : "Director"}</span>
                  <p>{message.content}</p>
                  {message.evidenceIds?.length ? <small>Evidence: {message.evidenceIds.join(", ")}</small> : null}
                </div>
              ))}
            </div>
          )}
          <div className="song-director-compose" role="group" aria-label="Ask Bragora AI Director">
            <label htmlFor="song-director-question">Question for the Director</label>
            <textarea id="song-director-question" rows={3} value={question} disabled={working} onChange={(event) => setQuestion(event.target.value)} placeholder="How could the emotional turn become a visual transition?" />
            <button type="button" className="secondary-button" disabled={working || !question.trim()} onClick={() => void send()}>{working ? "Thinking…" : "Ask Director"}</button>
          </div>
          {blocked && <p className="form-message" role="status">Live AI Director chat is blocked until no-charge provider eligibility is verified. Manual interpretation and browser Read Aloud remain available.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
