import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase/client";
import { useProject } from "../hooks/useProject";
import { useSong } from "../hooks/useSong";

interface Props { projectId: string; }

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

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user || !project || project.owner_id !== auth.user.id) {
      setError("Project not found or access denied."); setSaving(false); return;
    }

    let audioPath = song?.audio_path ?? null;
    if (audio) {
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
    } else await reload();
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
          {song?.audio_url && <audio controls src={song.audio_url} />}
          <label>Lyrics <textarea rows={8} value={lyrics} onChange={e => setLyrics(e.target.value)} /></label>
          <label>What are you trying to make people feel?<textarea rows={5} value={creativeDirection} onChange={e => setCreativeDirection(e.target.value)} placeholder="Not a prompt. Your intent." /></label>
          <label>Notes<textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} /></label>
          <button className="primary-button large" disabled={saving}>{saving ? "Saving…" : "Save song →"}</button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </div>
  </main>;
}
