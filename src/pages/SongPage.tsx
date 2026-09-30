import { FormEvent, useEffect, useState } from "react";
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
    if (!auth.user || !project || project.user_id !== auth.user.id) {
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

  return <main>
    <h1>{project.title}</h1><h2>Song Intake</h2>
    <form onSubmit={submit}>
      <label>Song title <input required value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label>Artist <input required value={artist} onChange={e => setArtist(e.target.value)} /></label>
      <label>Audio upload <input accept="audio/*" type="file" onChange={e => setAudio(e.target.files?.[0] ?? null)} /></label>
      {song?.audio_url && <audio controls src={song.audio_url} />}
      <label>Lyrics <textarea rows={10} value={lyrics} onChange={e => setLyrics(e.target.value)} /></label>
      <label>Creative direction <textarea rows={6} value={creativeDirection} onChange={e => setCreativeDirection(e.target.value)} /></label>
      <label>Notes <textarea rows={6} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <button disabled={saving}>{saving ? "Saving…" : "Save Song Intake"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
  </main>;
}
