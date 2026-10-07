import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase/client";
import { useProject } from "../hooks/useProject";
import { useSong } from "../hooks/useSong";
import { analyzeAudioLocally } from "../lib/musicAnalysis";
import { formatFailure } from "../lib/errorDetails";

interface Props { projectId: string; }

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement("audio");
    const cleanup = () => { URL.revokeObjectURL(url); element.removeAttribute("src"); element.load(); };
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error("Could not read the audio duration.")); }, 10000);
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      const duration = element.duration;
      cleanup();
      if (Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error("The uploaded audio has no readable duration."));
    };
    element.onerror = () => { window.clearTimeout(timeout); cleanup(); reject(new Error("Could not read the uploaded audio metadata.")); };
    element.src = url;
  });
}

export default function SongPage({ projectId }: Props) {
  const { project, loading: projectLoading, error: projectError } = useProject(projectId);
  const { song, loading: songLoading, error: songError, reload } = useSong(projectId);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [creativeDirection, setCreativeDirection] = useState("");
  const [notes, setNotes] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!song) return;
    setTitle(song.title); setArtist(song.artist);
    setLyrics(song.lyrics ?? ""); setCreativeDirection(song.creative_direction ?? "");
    setNotes(song.notes ?? "");
  }, [song]);

  async function analyzeAudio() {
    if (!song?.audio_url) { setError("Save an audio track before analyzing it."); return; }
    setError(null); setSaved(false); setSaving(true);
    let local: Awaited<ReturnType<typeof analyzeAudioLocally>> | null = null;
    try {
      await supabase.from("songs").update({ analysis_status: "analyzing" }).eq("id", song.id);
      local = await analyzeAudioLocally(song.audio_url);
      const localUpdate = await supabase.from("songs").update({ analysis_status: "analyzing", analysis: local }).eq("id", song.id);
      if (localUpdate.error) throw new Error(localUpdate.error.message);
      const { data: result, error: invokeError } = await supabase.functions.invoke("beatvision-analyze-song", { body: { projectId, audioRevision: song.audio_revision } });
      if (invokeError) {
        const message = result?.error || invokeError.message || "Groq song transcription failed.";
        await supabase.from("songs").update({
          analysis_status: "completed",
          analysis: { ...local, transcription_status: "failed", status_detail: message },
          analyzed_at: new Date().toISOString()
        }).eq("id", song.id);
        setError(formatFailure("Song transcription", invokeError, { projectId, songId: song.id, localAnalysis: "completed" }) + " | Local analysis was saved successfully.");
      }
      void reload();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Song analysis failed.";
      if (local) {
        await supabase.from("songs").update({
          analysis_status: "completed",
          analysis: { ...local, transcription_status: "failed", status_detail: message },
          analyzed_at: new Date().toISOString()
        }).eq("id", song.id);
      }
      setError(formatFailure("Song analysis", e, { projectId, songId: song.id }));
    } finally { setSaving(false); }
  }

  function continueToWorld() {
    window.location.href = `/projects/${projectId}/world`;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setSaved(false); setError(null);
    try {
      let { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        const refreshed = await supabase.auth.refreshSession();
        auth = refreshed.data;
      }
      if (!auth.user) throw new Error("Your sign-in session is no longer active. Sign in again, then retry Save song.");
      if (!project || project.owner_id !== auth.user.id) throw new Error("This project is not available to the signed-in account.");

      let audioPath = song?.audio_path ?? null;
      let songDuration = project.song_duration ?? null;
      if (audio) {
        songDuration = await readAudioDuration(audio);
        const extension = audio.name.includes(".") ? audio.name.split(".").pop() : "bin";
        audioPath = `${auth.user.id}/${projectId}/${crypto.randomUUID()}.${extension}`;
        const upload = await supabase.storage.from("songs").upload(audioPath, audio, { upsert: false, contentType: audio.type || undefined });
        if (upload.error) throw new Error(upload.error.message);
        if (song?.audio_path) await supabase.storage.from("songs").remove([song.audio_path]);
      }

      const payload: Record<string, unknown> = {
        project_id: projectId, title: title.trim(), artist: artist.trim(),
        lyrics: lyrics.trim() || null,
        creative_direction: creativeDirection.trim() || null, notes: notes.trim() || null
      };
      // The DB invalidates analysis on UPDATE OF audio_path. Do not send the
      // existing path on an ordinary metadata save or completed analysis resets.
      if (audio) payload.audio_path = audioPath;
      const result = song
        ? await supabase.from("songs").update(payload).eq("id", song.id).select("id").single()
        : await supabase.from("songs").insert(payload).select("id").single();

      if (result.error) {
        if (audioPath && audioPath !== song?.audio_path) await supabase.storage.from("songs").remove([audioPath]);
        throw new Error(result.error.message);
      }

      const projectUpdate = await supabase.from("projects").update({ song_duration: songDuration }).eq("id", projectId);
      if (projectUpdate.error) throw new Error(projectUpdate.error.message);

      await reload();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save song failed.");
    } finally { setSaving(false); }
  }

  if (projectLoading || songLoading) return <main><p>Loading project…</p></main>;
  if (projectError || songError) return <main><p role="alert">{projectError ?? songError}</p></main>;
  if (!project) return <main><p role="alert">Project not found.</p></main>;

  const analysis = song?.analysis;
  const durationSeconds = analysis ? Number(analysis.duration_seconds) : 0;
  const hasValidAnalysisDuration = Number.isFinite(durationSeconds) && durationSeconds > 0;

  return <main className="app-shell">
    <div className="dashboard">
      <button className="brand" onClick={() => { window.location.href = "/"; }}>BEAT<span>VISION</span></button>
      <section className="create-card">
        <div className="eyebrow">01 / SONG</div>
        <h1>Start with the song.</h1>
        <p>The track is the source material. Add enough intent for BeatVision to reveal the world without taking authorship away from you.</p>
        <form onSubmit={submit}>
          <label>Song title <input required value={title} onChange={e => { setTitle(e.target.value); setSaved(false); }} placeholder="Song title" /></label>
          <label>Artist <input required value={artist} onChange={e => { setArtist(e.target.value); setSaved(false); }} placeholder="Artist name" /></label>
          <label>Audio upload <input accept="audio/*" type="file" onChange={e => { setAudio(e.target.files?.[0] ?? null); setSaved(false); }} /></label>
          {song?.audio_url && <><audio controls src={song.audio_url} /><button type="button" onClick={() => void analyzeAudio()} disabled={saving || song.analysis_status === "analyzing"}>{saving || song.analysis_status === "analyzing" ? "Analyzing music…" : song.analysis_status === "completed" ? "Re-analyze" : "Analyze music"}</button></>}
          <label>Lyrics <textarea rows={8} value={lyrics} onChange={e => { setLyrics(e.target.value); setSaved(false); }} /></label>
          <label>What are you trying to make people feel?<textarea rows={5} value={creativeDirection} onChange={e => { setCreativeDirection(e.target.value); setSaved(false); }} placeholder="Not a prompt. Your intent." /></label>
          <label>Notes<textarea rows={4} value={notes} onChange={e => { setNotes(e.target.value); setSaved(false); }} /></label>
          <button className="primary-button large" disabled={saving}>{saving ? "Saving…" : saved ? "Saved ✓" : "Save song →"}</button>
        </form>
        {saved && (
          <section aria-label="Next step" className="create-card">
            <p role="status"><strong>Song saved successfully.</strong></p>
            {song?.analysis_status === "completed" ? (
              <>
                <p>Next step: reveal the visual world for this song.</p>
                <button type="button" className="primary-button large" onClick={continueToWorld}>
                  Continue to World →
                </button>
              </>
            ) : (
              <p>Next step: click <strong>Analyze music</strong> above. BeatVision will analyze the song before World Reveal.</p>
            )}
          </section>
        )}
        {song?.analysis_status === "completed" && analysis && <section><h2>Musical analysis</h2><p>{hasValidAnalysisDuration ? `Duration ${durationSeconds.toFixed(1)}s` : "Duration unavailable"}{analysis.bpm ? ` · BPM ${analysis.bpm}` : ""}{analysis.key ? ` · Key ${analysis.key}` : ""}{analysis.time_signature ? ` · Meter ${analysis.time_signature}` : ""}</p><p>{analysis.genre_tags?.join(", ") || "Genre unavailable"} · {analysis.mood_tags?.slice(0, 5).join(", ") || "Mood unavailable"}</p><p>{analysis.sections?.length ?? 0} structural segments · {analysis.instruments?.slice(0, 8).join(", ") || "Instrument data unavailable"}</p>{analysis.description && <p>{analysis.description}</p>}{analysis.transcript && <><h3>Transcript</h3><p>{analysis.transcript}</p></>}</section>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </div>
  </main>;
}
