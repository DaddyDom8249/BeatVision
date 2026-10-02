import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase/client";
import { useProject } from "../hooks/useProject";
import { useSong } from "../hooks/useSong";
import type { SongAnalysis } from "../types/song";

interface Props { projectId: string; }

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement("audio");
    const cleanup = () => {
      URL.revokeObjectURL(url);
      element.removeAttribute("src");
      element.load();
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Could not read the audio duration."));
    }, 10000);
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      const duration = element.duration;
      cleanup();
      if (Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error("The uploaded audio has no readable duration."));
    };
    element.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(new Error("Could not read the uploaded audio metadata."));
    };
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!song) return;
    setTitle(song.title); setArtist(song.artist);
    setLyrics(song.lyrics ?? ""); setCreativeDirection(song.creative_direction ?? "");
    setNotes(song.notes ?? "");
  }, [song]);

  async function analyzeAudio() {\n    if (!song?.audio_url) { setError("Save an audio track before analyzing it."); return; }\n    setError(null);\n    await supabase.from("songs").update({ analysis_status: "analyzing" }).eq("id", song.id);\n    try {\n      const response = await fetch(song.audio_url);\n      if (!response.ok) throw new Error("Could not load the audio for analysis.");\n      const buffer = await response.arrayBuffer();\n      const context = new AudioContext();\n      const decoded = await context.decodeAudioData(buffer);\n      const samples = decoded.getChannelData(0);\n      const block = Math.max(1, Math.floor(samples.length / 48));\n      const curve: Array<{time:number;energy:number}> = [];\n      let peak = 0, sumSquares = 0, silent = 0;\n      for (let i = 0; i < samples.length; i += block) {\n        const end = Math.min(samples.length, i + block); let sum = 0, localPeak = 0;\n        for (let j = i; j < end; j++) { const v = Math.abs(samples[j]); sum += v * v; localPeak = Math.max(localPeak, v); }\n        const energy = Math.sqrt(sum / Math.max(1, end - i)); curve.push({ time: i / decoded.sampleRate, energy }); peak = Math.max(peak, localPeak); sumSquares += sum;\n        if (energy < 0.015) silent += end - i;\n      }\n      const analysis: SongAnalysis = { duration_seconds: decoded.duration, sample_rate: decoded.sampleRate, channels: decoded.numberOfChannels, peak, rms: Math.sqrt(sumSquares / samples.length), silence_ratio: silent / samples.length, energy_curve: curve, analysis_method: "browser_audio_decode" };\n      const result = await supabase.from("songs").update({ analysis_status: "completed", analysis, analyzed_at: new Date().toISOString() }).eq("id", song.id);\n      if (result.error) throw new Error(result.error.message);\n      await reload();\n    } catch (e) { await supabase.from("songs").update({ analysis_status: "failed" }).eq("id", song.id); setError(e instanceof Error ? e.message : "Audio analysis failed."); }\n  }\n\n  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user || !project || project.owner_id !== auth.user.id) {
      setError("Project not found or access denied."); setSaving(false); return;
    }

    let audioPath = song?.audio_path ?? null;
    let songDuration = project.song_duration ?? null;
    if (audio) {
      try {
        songDuration = await readAudioDuration(audio);
      } catch (durationError) {
        setError(durationError instanceof Error ? durationError.message : "Could not read the audio duration.");
        setSaving(false);
        return;
      }
      const extension = audio.name.includes(".") ? audio.name.split(".").pop() : "bin";
      audioPath = `${auth.user.id}/${projectId}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage.from("audio").upload(audioPath, audio, {
        upsert: false, contentType: audio.type || undefined
      });
      if (upload.error) { setError(upload.error.message); setSaving(false); return; }
      if (song?.audio_path) await supabase.storage.from("audio").remove([song.audio_path]);
    }

    const payload = {
      project_id: projectId, title: title.trim(), artist: artist.trim(),
      audio_path: audioPath, lyrics: lyrics.trim() || null,
      creative_direction: creativeDirection.trim() || null, notes: notes.trim() || null
    };
    const result = song
      ? await supabase.from("songs").update(payload).eq("id", song.id).select("id").single()
      : await supabase.from("songs").insert(payload).select("id").single();

    if (result.error) {
      if (audioPath && audioPath !== song?.audio_path) await supabase.storage.from("audio").remove([audioPath]);
      setError(result.error.message);
    } else {
      const projectUpdate = await supabase.from("projects")
        .update({ song_duration: songDuration })
        .eq("id", projectId);
      if (projectUpdate.error) {
        setError(projectUpdate.error.message);
      } else {
        await reload();
      }
    }
    setSaving(false);
  }

  if (projectLoading || songLoading) return <main><p>Loading project…</p></main>;
  if (projectError || songError) return <main><p role="alert">{projectError ?? songError}</p></main>;
  if (!project) return <main><p role="alert">Project not found.</p></main>;

  return <main className="app-shell">
    <div className="dashboard">
      <button className="brand" onClick={() => { window.location.href = "/"; }}>BEAT<span>VISION</span></button>
      <section className="create-card">
        <div className="eyebrow">01 / SONG</div>
        <h1>Start with the song.</h1>
        <p>The track is the source material. Add enough intent for BeatVision to reveal the world without taking authorship away from you.</p>
        <form onSubmit={submit}>
          <label>Song title <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Song title" /></label>
          <label>Artist <input required value={artist} onChange={e => setArtist(e.target.value)} placeholder="Artist name" /></label>
          <label>Audio upload <input accept="audio/*" type="file" onChange={e => setAudio(e.target.files?.[0] ?? null)} /></label>
          {song?.audio_url && <><audio controls src={song.audio_url} /><button type="button" onClick={() => void analyzeAudio()} disabled={song.analysis_status === "analyzing"}>{song.analysis_status === "analyzing" ? "Analyzing…" : song.analysis_status === "completed" ? "Re-analyze audio" : "Analyze audio"}</button></>}
          <label>Lyrics <textarea rows={8} value={lyrics} onChange={e => setLyrics(e.target.value)} /></label>
          <label>What are you trying to make people feel?<textarea rows={5} value={creativeDirection} onChange={e => setCreativeDirection(e.target.value)} placeholder="Not a prompt. Your intent." /></label>
          <label>Notes<textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} /></label>
          <button className="primary-button large" disabled={saving}>{saving ? "Saving…" : "Save song →"}</button>
        </form>
        {song?.analysis_status === "completed" && song.analysis && <section><h2>Song analysis</h2><p>Duration {song.analysis.duration_seconds.toFixed(1)}s · RMS {song.analysis.rms.toFixed(3)} · Peak {song.analysis.peak.toFixed(3)} · Silence {(song.analysis.silence_ratio * 100).toFixed(1)}%</p></section>}\n        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </div>
  </main>;
}
