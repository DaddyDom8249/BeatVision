import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase/client";
import { useProject } from "../hooks/useProject";
import { useSong } from "../hooks/useSong";
import { useSongInterpretation } from "../hooks/useSongInterpretation";
import { analyzeAudioLocally } from "../lib/musicAnalysis";
import { formatFailure } from "../lib/errorDetails";
import StudioHeader from "../components/navigation/StudioHeader";
import SongInterpretationPanel from "../components/song/SongInterpretationPanel";

interface Props {
  projectId: string;
}

export default function SongPage({ projectId }: Props) {
  const { project, loading: projectLoading, error: projectError } = useProject(projectId);
  const { song, loading: songLoading, error: songError, schemaReady = true, reload } = useSong(projectId);
  const interpretation = useSongInterpretation(projectId, song?.id, song?.current_interpretation_id);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [creativeDirection, setCreativeDirection] = useState("");
  const [notes, setNotes] = useState("");
  const [preferredVisualStyle, setPreferredVisualStyle] = useState("");
  const [imageryMode, setImageryMode] = useState("");
  const [narrativeMode, setNarrativeMode] = useState("");
  const [unwantedThemes, setUnwantedThemes] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!song) return;
    setTitle(song.title);
    setArtist(song.artist);
    setLyrics(song.lyrics ?? "");
    setCreativeDirection(song.creative_direction ?? "");
    setNotes(song.notes ?? "");
    setPreferredVisualStyle(song.visual_style_preferences?.preferred_visual_style ?? "");
    setImageryMode(song.visual_style_preferences?.imagery_mode ?? "");
    setNarrativeMode(song.visual_style_preferences?.narrative_mode ?? "");
    setUnwantedThemes(song.visual_style_preferences?.unwanted_themes ?? "");
  }, [song?.id, song?.title, song?.artist, song?.lyrics, song?.creative_direction, song?.notes, song?.visual_style_preferences]);

  async function analyzeAudio() {
    if (saving || analyzing || song?.analysis_status === "analyzing") return;
    if (!song?.audio_url) {
      setError("Save an audio track before analyzing it.");
      return;
    }
    setError(null);
    setSaved(false);
    setAnalyzing(true);
    let local: Awaited<ReturnType<typeof analyzeAudioLocally>> | null = null;
    let localPersisted = false;
    let localFailure: Error | null = null;
    try {
      const persistAnalysis = (status: string, analysis?: unknown) => supabase.rpc('save_local_song_analysis', {
        p_project_id: projectId, p_song_id: song.id, p_audio_revision: song.audio_revision,
        p_status: status, p_analysis: analysis ?? null,
      });
      const markAnalyzing = await persistAnalysis('analyzing');
      if (markAnalyzing.error) throw new Error(markAnalyzing.error.message);

      try {
        local = await analyzeAudioLocally(song.audio_url);
      } catch (e) {
        localFailure = e instanceof Error ? e : new Error(String(e));
      }

      if (local) {
        const localUpdate = await persistAnalysis('analyzing', local);
        if (localUpdate.error) throw new Error(localUpdate.error.message);
        localPersisted = true;
      }

      const { data: result, error: invokeError } = await supabase.functions.invoke(
        "beatvision-analyze-song",
        { body: { projectId, audioRevision: song.audio_revision } }
      );

      if (invokeError) {
        if (!localPersisted) throw invokeError;
        const message = result?.error || invokeError.message || "Groq song transcription failed.";
        const fallbackUpdate = await supabase.rpc('save_local_song_analysis', {p_project_id:projectId,p_song_id:song.id,p_audio_revision:song.audio_revision,p_status:'completed',p_analysis:{...local,transcription_status:'failed',status_detail:message}});
        if (fallbackUpdate.error) throw new Error(fallbackUpdate.error.message);
        setError(formatFailure("Song transcription", invokeError, {
          projectId, songId: song.id, localAnalysis: "completed"
        }) + " | Local analysis was saved successfully.");
      } else if (localFailure) {
        setError("Server transcription completed. Browser musical DSP was unavailable, so some musical fields may be unavailable.");
      }

      await reload();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Song analysis failed.";
      if (local && localPersisted) {
        const fallbackUpdate = await supabase.rpc('save_local_song_analysis', {p_project_id:projectId,p_song_id:song.id,p_audio_revision:song.audio_revision,p_status:'completed',p_analysis:{...local,transcription_status:'failed',status_detail:message}});
        if (fallbackUpdate.error) {
          await supabase.rpc('save_local_song_analysis', {p_project_id:projectId,p_song_id:song.id,p_audio_revision:song.audio_revision,p_status:'failed',p_analysis:null});
          setError(formatFailure("Song analysis", e, { projectId, songId: song.id }) +
            " | Local analysis could not be persisted: " + fallbackUpdate.error.message);
          return;
        }
      }
      if (!localPersisted) await supabase.rpc('save_local_song_analysis', {p_project_id:projectId,p_song_id:song.id,p_audio_revision:song.audio_revision,p_status:'failed',p_analysis:null});
      setError(formatFailure("Song analysis", e, { projectId, songId: song.id }));
      await reload();
    } finally {
      setAnalyzing(false);
    }
  }

  function continueToWorld() {
    window.location.href = `/projects/${projectId}/world`;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || analyzing) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      let { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        const refreshed = await supabase.auth.refreshSession();
        auth = refreshed.data;
      }
      if (!auth.user) throw new Error("Your sign-in session is no longer active. Sign in again, then retry Save song.");
      if (!project || project.owner_id !== auth.user.id) throw new Error("This project is not available to the signed-in account.");

      let audioPath = song?.audio_path ?? null;
      if (audio) {
        const extension = audio.name.includes(".") ? audio.name.split(".").pop() : "bin";
        audioPath = `${auth.user.id}/${projectId}/${crypto.randomUUID()}.${extension}`;
        const upload = await supabase.storage.from("songs").upload(audioPath, audio, { upsert: false, contentType: audio.type || undefined });
        if (upload.error) throw new Error(upload.error.message);
        // Keep prior audio: failed saves and immutable Vision Locks may still reference it.
      }

      const payload: Record<string, unknown> = {
        title: title.trim(),
        artist: artist.trim(),
        lyrics: lyrics.trim() || null,
        creative_direction: creativeDirection.trim() || null,
        notes: notes.trim() || null,
      };
      // Do not send nonexistent columns to an older database. Visual-style
      // controls remain disabled in this state; backend interpretation stays off.
      if (schemaReady) payload.visual_style_preferences = {
        preferred_visual_style: preferredVisualStyle.trim(),
        imagery_mode: imageryMode || null,
        narrative_mode: narrativeMode || null,
        unwanted_themes: unwantedThemes.trim(),
      };
      if (audio) payload.audio_path = audioPath;
      const result = song
        ? await supabase.from("songs").update(payload).eq("id", song.id).select("id").single()
        : await supabase.from("songs").insert({ project_id: projectId, ...payload }).select("id").single();

      if (result.error) {
        if (audioPath && audioPath !== song?.audio_path) await supabase.storage.from("songs").remove([audioPath]);
        throw new Error(result.error.message);
      }

      setAudio(null);
      await reload();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save song failed.");
    } finally {
      setSaving(false);
    }
  }

  const songIntakeDirty = Boolean(audio || (song && (
    title !== song.title || artist !== song.artist || lyrics !== (song.lyrics ?? "") ||
    creativeDirection !== (song.creative_direction ?? "") || notes !== (song.notes ?? "") ||
    (schemaReady && (
      preferredVisualStyle !== (song.visual_style_preferences?.preferred_visual_style ?? "") ||
      imageryMode !== (song.visual_style_preferences?.imagery_mode ?? "") ||
      narrativeMode !== (song.visual_style_preferences?.narrative_mode ?? "") ||
      unwantedThemes !== (song.visual_style_preferences?.unwanted_themes ?? "")
    ))
  )));

  if (projectLoading || songLoading) {
    return (
      <div className="app-shell">
        <StudioHeader projectId={projectId} activeStage="song" />
        <main className="dashboard"><p>Loading project song intake…</p></main>
      </div>
    );
  }

  if (projectError || songError || !project) {
    return (
      <div className="app-shell">
        <StudioHeader projectId={projectId} activeStage="song" />
        <main className="dashboard"><p className="form-error" role="alert">{projectError ?? songError ?? "Project not found."}</p></main>
      </div>
    );
  }

  const analysis = song?.analysis;
  const durationSeconds = analysis ? Number(analysis.duration_seconds) : 0;
  const hasValidAnalysisDuration = Number.isFinite(durationSeconds) && durationSeconds > 0;

  return (
    <div className="app-shell">
      <StudioHeader
        projectId={projectId}
        projectTitle={project.title}
        activeStage="song"
        statusBadge={song?.analysis_status === "completed" ? "ANALYZED" : "DRAFT"}
      />

      <main className="dashboard" style={{ maxWidth: "1000px" }}>
        <section className="create-card">
          <div className="eyebrow">01 / SONG INTAKE</div>
          <h1>Song Intake & Musical Direction</h1>
          <p>
            The audio track is the primary source material. Provide song details and artistic intent for BeatVision to analyze before World Reveal.
          </p>

          {!schemaReady && <p className="form-message" role="status">
            This preview can read and edit your existing song details. New Song Intelligence
            features require a database upgrade and are unavailable until that migration is approved.
            Your existing project and audio have not been changed.
          </p>}

          <form onSubmit={submit}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
              <label>
                Song title
                <input
                  required
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setSaved(false); }}
                  placeholder="Song title"
                />
              </label>
              <label>
                Artist
                <input
                  required
                  value={artist}
                  onChange={(e) => { setArtist(e.target.value); setSaved(false); }}
                  placeholder="Artist name"
                />
              </label>
            </div>

            <label>
              Audio Upload (.mp3, .wav, .m4a)
              <input
                accept="audio/*"
                type="file"
                onChange={(e) => { setAudio(e.target.files?.[0] ?? null); setSaved(false); }}
              />
            </label>

            {song?.audio_url && (
              <div className="song-player-card" style={{ background: "var(--bg-surface-0)", border: "1px solid var(--border-subtle)", padding: "16px", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <span className="panel-label" style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent-gold)" }}>AUDIO TRACK PREVIEW</span>
                <audio controls src={song.audio_url} style={{ width: "100%" }} />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void analyzeAudio()}
                  disabled={saving || analyzing || song.analysis_status === "analyzing"}
                  style={{ alignSelf: "flex-start" }}
                >
                  {analyzing || song.analysis_status === "analyzing"
                    ? "Analyzing Music Signal…"
                    : song.analysis_status === "completed"
                    ? "Re-Analyze Music"
                    : "Analyze Music Signal"}
                </button>
              </div>
            )}

            <label>
              Lyrics
              <textarea
                rows={6}
                value={lyrics}
                onChange={(e) => { setLyrics(e.target.value); setSaved(false); }}
                placeholder="Song lyrics..."
              />
            </label>

            <label>
              Creative Intent & Emotional Goal
              <textarea
                rows={4}
                value={creativeDirection}
                onChange={(e) => { setCreativeDirection(e.target.value); setSaved(false); }}
                placeholder="Describe what you want viewers to feel and experience visually."
              />
            </label>

            <fieldset className="song-style-preferences" disabled={!schemaReady}>
              <legend>Artist-directed visual style (optional)</legend>
              <label>Preferred visual style
                <input value={preferredVisualStyle} onChange={(event) => { setPreferredVisualStyle(event.target.value); setSaved(false); }}
                  placeholder="Naturalistic, ink illustration, film noir, etc." />
              </label>
              <label>Imagery
                <select value={imageryMode} onChange={(event) => { setImageryMode(event.target.value); setSaved(false); }}>
                  <option value="">Artist decides later</option><option value="realistic">Realistic</option><option value="stylized">Stylized</option>
                </select>
              </label>
              <label>Visual storytelling
                <select value={narrativeMode} onChange={(event) => { setNarrativeMode(event.target.value); setSaved(false); }}>
                  <option value="">Artist decides later</option><option value="narrative">Narrative</option><option value="abstract">Abstract</option>
                </select>
              </label>
              <label>Unwanted visual themes
                <textarea rows={2} value={unwantedThemes} onChange={(event) => { setUnwantedThemes(event.target.value); setSaved(false); }}
                  placeholder="Things Bragora must not introduce without approval" />
              </label>
            </fieldset>

            <label>
              Notes
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
                placeholder="Additional notes for production..."
              />
            </label>

            {schemaReady ? <SongInterpretationPanel
              song={song}
              loading={interpretation.loading}
              working={interpretation.working}
              error={interpretation.error}
              manualFallback={interpretation.manualFallback}
              latestDraft={interpretation.latestDraft}
              confirmed={interpretation.confirmed}
              saveDraft={interpretation.saveDraft}
              propose={interpretation.propose}
              confirm={interpretation.confirm}
              onConfirmed={reload}
              songIntakeDirty={songIntakeDirty}
            /> : <p role="status">Interpretation and World confirmation are locked until the Song Intelligence database migration is available.</p>}

            <button className="primary-button large" disabled={saving || analyzing}>
              {saving ? "Saving Song…" : saved ? "Song Saved ✓" : "Save Song Details →"}
            </button>
          </form>

          {schemaReady && (saved || song?.analysis_status === "completed") && (
            <section aria-label="Next step" className="create-card" style={{ marginTop: "24px", background: "var(--bg-surface-0)" }}>
              {saved && <p role="status" style={{ color: "var(--color-success)", fontWeight: 600 }}>Song details saved successfully.</p>}
              {song?.analysis_status === "completed" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <p>Musical signal analysis is complete. Ready to reveal the visual world for this song.</p>
                  <button type="button" className="primary-button large" onClick={continueToWorld}>
                    Continue to World Reveal →
                  </button>
                </div>
              ) : (
                <p>Click <strong>Analyze Music Signal</strong> above to allow BeatVision to analyze the track before World Reveal.</p>
              )}
            </section>
          )}

          {song?.analysis_status === "completed" && analysis && (
            <section style={{ marginTop: "32px", borderTop: "1px solid var(--border-subtle)", paddingTop: "24px" }}>
              <div className="eyebrow">MUSICAL SIGNAL ANALYSIS</div>
              <h2 style={{ fontSize: "20px", color: "#ffffff", marginBottom: "16px" }}>Track Intelligence Breakdown</h2>
              <p>Tempo and key are estimates. Structural boundaries are heuristic candidates to review before directing scenes.</p>

              <div className="analysis-dashboard-grid">
                <div className="analysis-metric-card">
                  <span className="metric-label">Duration</span>
                  <span className="metric-value">{hasValidAnalysisDuration ? `${durationSeconds.toFixed(1)}s` : "Unavailable"}</span>
                </div>
                <div className="analysis-metric-card">
                  <span className="metric-label">BPM estimate</span>
                  <span className="metric-value">{analysis.bpm ? String(analysis.bpm) : "N/A"}</span>
                </div>
                <div className="analysis-metric-card">
                  <span className="metric-label">Musical key estimate</span>
                  <span className="metric-value">{analysis.key ?? "N/A"}</span>
                </div>
                <div className="analysis-metric-card">
                  <span className="metric-label">Time Signature</span>
                  <span className="metric-value">{analysis.time_signature || "Unavailable"}</span>
                </div>
              </div>

              <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
                <div className="analysis-metric-card">
                  <span className="metric-label">Genre & Mood Tags</span>
                  <span className="metric-value" style={{ fontSize: "14px", fontWeight: 500 }}>
                    {analysis.genre_tags?.join(", ") || "Genre N/A"} • {analysis.mood_tags?.slice(0, 5).join(", ") || "Mood N/A"}
                  </span>
                </div>
                <div className="analysis-metric-card">
                  <span className="metric-label">Structural candidates</span>
                  <span className="metric-value" style={{ fontSize: "14px", fontWeight: 500 }}>
                    {analysis.sections?.length ?? 0} candidate regions • Instruments: {analysis.instruments?.slice(0, 6).join(", ") || "N/A"}
                  </span>
                </div>
                {analysis.description && (
                  <div className="analysis-metric-card">
                    <span className="metric-label">AI Music Summary</span>
                    <p style={{ fontSize: "13px", color: "var(--text-main)", lineHeight: "1.5" }}>{analysis.description}</p>
                  </div>
                )}
                {analysis.transcript && (
                  <div className="analysis-metric-card">
                    <span className="metric-label">Vocal Transcript</span>
                    <p style={{ fontSize: "13px", color: "var(--text-main)", lineHeight: "1.5" }}>{analysis.transcript}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {error && <p className="form-error" role="alert" style={{ marginTop: "16px" }}>{error}</p>}
        </section>
      </main>
    </div>
  );
}
