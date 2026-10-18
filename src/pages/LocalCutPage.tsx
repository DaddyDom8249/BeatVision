import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase/client";
import StudioHeader from "../components/navigation/StudioHeader";

type Scene = { id: string; scene_number: number; title: string; start_time: number; end_time: number; status: string };
type LocalTake = { file: File; url: string; kind: "image" | "video" };
type Plan = { id: string; title: string; duration_seconds: number };
const MAX_LOCAL_SCENES = 100;
const MAX_RENDER_SECONDS = 600;
const MAX_CANVAS_SIDE = 1280;

function sceneAt(scenes: Scene[], seconds: number) {
  return scenes.find(s => seconds >= s.start_time && seconds < s.end_time) ?? scenes[scenes.length - 1];
}

function outputMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

function readImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("An imported scene image cannot be decoded on this device."));
    image.src = url;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

/**
 * Local Cut is deliberately a separate, non-provider output. Files are not sent
 * to Supabase, marked as approved, or represented as provider-generated assets.
 */
export default function LocalCutPage({ projectId }: { projectId: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [takes, setTakes] = useState<Record<string, LocalTake>>({});
  const takesRef = useRef<Record<string, LocalTake>>({});
  const [audio, setAudio] = useState<LocalTake | null>(null);
  const audioRef = useRef<LocalTake | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const exportRef = useRef<string | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => { takesRef.current = takes; }, [takes]);
  useEffect(() => { audioRef.current = audio; }, [audio]);
  useEffect(() => {
    return () => {
      Object.values(takesRef.current).forEach(take => URL.revokeObjectURL(take.url));
      if (audioRef.current) URL.revokeObjectURL(audioRef.current.url);
      if (exportRef.current) URL.revokeObjectURL(exportRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      const requestedPlan = new URLSearchParams(window.location.search).get("plan");
      let query = supabase.from("visual_plans").select("id,title,duration_seconds")
        .eq("project_id", projectId).eq("status", "approved");
      if (requestedPlan) query = query.eq("id", requestedPlan);
      const selected = await query.order("revision_number", { ascending: false }).limit(1).maybeSingle();
      if (selected.error) throw selected.error;
      if (!selected.data) throw new Error("Approve a Visual Plan before opening Local Cut.");
      const sceneRows = await supabase.from("visual_plan_scenes")
        .select("id,scene_number,title,start_time,end_time,status")
        .eq("project_id", projectId).eq("visual_plan_id", selected.data.id)
        .order("scene_number", { ascending: true });
      if (sceneRows.error) throw sceneRows.error;
      const rows = (sceneRows.data ?? []) as Scene[];
      if (!rows.length || rows.length > MAX_LOCAL_SCENES || rows.some(s => s.status !== "approved"))
        throw new Error("Local Cut requires an approved Visual Plan with 1–100 approved scenes.");
      if (active) { setPlan(selected.data as Plan); setScenes(rows); }
    })().catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  const selected = useMemo(() => sceneAt(scenes, seconds), [scenes, seconds]);
  const complete = scenes.length > 0 && scenes.every(scene => takes[scene.id]?.kind === "image");
  const mime = outputMimeType();
  const duration = Number(plan?.duration_seconds || 0);
  const canExport = complete && audio !== null && mime !== null &&
    duration > 0 && duration <= MAX_RENDER_SECONDS && !rendering;
  const isVideoSelected = scenes.some(s => takes[s.id]?.kind === "video");

  function replaceTake(sceneId: string, file?: File) {
    if (!file) return;
    const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : null;
    if (!kind) { setError("Select an image or video file."); return; }
    if (file.size > 250 * 1024 * 1024) { setError("Files over 250 MB cannot be previewed locally."); return; }
    setTakes(previous => {
      if (previous[sceneId]) URL.revokeObjectURL(previous[sceneId].url);
      return { ...previous, [sceneId]: { file, url: URL.createObjectURL(file), kind } };
    });
    setError(null);
  }

  function replaceSong(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("audio/") || file.size > 150 * 1024 * 1024) {
      setError("Select an audio file smaller than 150 MB."); return;
    }
    setAudio(previous => {
      if (previous) URL.revokeObjectURL(previous.url);
      return { file, url: URL.createObjectURL(file), kind: "video" };
    });
    setSeconds(0); setError(null);
  }

  async function exportCut() {
    if (!canExport || !plan || !audio || !mime) return;
    setError(null); setRendering(true);
    let context: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;
    let mediaStream: MediaStream | null = null;
    let audioSource: AudioBufferSourceNode | null = null;
    try {
      const canvas = canvasRef.current;
      if (!canvas || typeof canvas.captureStream !== "function")
        throw new Error("This iOS WebView does not support local canvas capture. Preview remains available; no provider was called.");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This device cannot initialize the local video canvas.");
      const images = new Map<string, HTMLImageElement>();
      for (const scene of scenes) {
        const take = takes[scene.id];
        if (!take || take.kind !== "image") throw new Error("Every scene must use an imported image for local export.");
        images.set(scene.id, await readImage(take.url));
      }
      context = new AudioContext();
      const decoded = await context.decodeAudioData(await audio.file.arrayBuffer());
      if (Math.abs(decoded.duration - duration) > 0.5)
        throw new Error("The selected song duration differs from the locked Visual Plan. Use the matching song; scene timing will not be silently changed.");
      if (scenes[0].start_time !== 0 || Math.abs(scenes[scenes.length - 1].end_time - duration) > 0.05)
        throw new Error("Approved scene timings do not cover the full song.");
      for (let i = 1; i < scenes.length; i++)
        if (Math.abs(scenes[i].start_time - scenes[i - 1].end_time) > 0.05)
          throw new Error("Approved scene timings contain a gap or overlap.");
      canvas.width = MAX_CANVAS_SIDE;
      canvas.height = 720;
      const first = images.get(scenes[0].id);
      if (first) drawCover(ctx, first, canvas.width, canvas.height);
      const videoStream = canvas.captureStream(30);
      const audioDestination = context.createMediaStreamDestination();
      audioSource = context.createBufferSource();
      audioSource.buffer = decoded;
      audioSource.connect(audioDestination);
      mediaStream = new MediaStream([...videoStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
      const parts: BlobPart[] = [];
      recorder = new MediaRecorder(mediaStream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
      const finished = new Promise<Blob>((resolve, reject) => {
        recorder!.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
        recorder!.onerror = () => reject(new Error("The device failed to encode the local video."));
        recorder!.onstop = () => {
          const blob = new Blob(parts, { type: mime });
          blob.size > 0 ? resolve(blob) : reject(new Error("The local video encoder produced an empty file."));
        };
      });
      await context.resume();
      recorder.start(1000);
      const start = performance.now();
      audioSource.start();
      await new Promise<void>((resolve, reject) => {
        const draw = () => {
          if (recorder?.state === "inactive") { reject(new Error("Local video capture stopped unexpectedly.")); return; }
          const current = Math.min(duration, (performance.now() - start) / 1000);
          const scene = sceneAt(scenes, current === duration ? duration - 0.001 : current);
          const frame = scene && images.get(scene.id);
          if (frame) drawCover(ctx, frame, canvas.width, canvas.height);
          if (current >= duration) resolve(); else window.requestAnimationFrame(draw);
        };
        window.requestAnimationFrame(draw);
      });
      if (recorder.state !== "inactive") recorder.stop();
      const blob = await finished;
      if (exportRef.current) URL.revokeObjectURL(exportRef.current);
      const url = URL.createObjectURL(blob);
      exportRef.current = url; setExportUrl(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      try { audioSource?.stop(); } catch { /* source may not have started */ }
      if (recorder?.state !== "inactive") recorder?.stop();
      mediaStream?.getTracks().forEach(track => track.stop());
      if (context) void context.close();
      setRendering(false);
    }
  }

  return (
    <div className="app-shell">
      <StudioHeader projectId={projectId} activeStage="production" statusBadge="LOCAL CUT · NO PROVIDER" />
      <main className="dashboard" style={{ maxWidth: 1100 }}>
        <span className="eyebrow">iOS / DEVICE-LOCAL PRODUCTION</span>
        <h1>Local Cut</h1>
        <p>Use the approved BeatVision scene timing with files you own. Imports remain on this device. No AI provider, queue, credits or payment is used. This is a manual animatic, not AI image or motion generation.</p>
        {error && <p role="alert" className="form-error">{error}</p>}
        {loading && <p>Loading approved scenes…</p>}
        {plan && <>
          <h2>{plan.title} · {duration.toFixed(1)} seconds</h2>
          <label style={{ display: "block", marginBottom: 20 }}>Choose the original song
            <input aria-label="Choose original song" type="file" accept="audio/*" onChange={e => replaceSong(e.target.files?.[0])} />
          </label>
          {audio && <audio ref={playerRef} src={audio.url} controls
            onTimeUpdate={e => setSeconds(e.currentTarget.currentTime)}
            onSeeked={e => setSeconds(e.currentTarget.currentTime)}
            style={{ width: "100%", marginBottom: 18 }} />}
          {selected && <section className="production-provider-note" aria-label="Local preview">
            <p>Current scene {selected.scene_number}: {selected.title} ({selected.start_time.toFixed(1)}–{selected.end_time.toFixed(1)}s)</p>
            {takes[selected.id]?.kind === "image" && <img src={takes[selected.id].url} alt={"Scene " + selected.scene_number} style={{ width: "100%", maxHeight: 450, objectFit: "contain" }} />}
            {takes[selected.id]?.kind === "video" && <video key={selected.id} src={takes[selected.id].url} controls muted playsInline style={{ width: "100%", maxHeight: 450 }} />}
            {!takes[selected.id] && <p>Choose an image or clip for this scene below.</p>}
          </section>}
          <section aria-label="Local scene files" style={{ display: "grid", gap: 12, marginTop: 20 }}>
            {scenes.map(scene => <label key={scene.id} className="production-provider-note">
              <strong>Scene {scene.scene_number} · {scene.title}</strong>
              <span style={{ display: "block" }}>{scene.start_time.toFixed(1)}–{scene.end_time.toFixed(1)}s · {takes[scene.id]?.file.name ?? "No local file selected"}</span>
              <input aria-label={"Choose media for scene " + scene.scene_number} type="file" accept="image/*,video/*"
                onChange={e => replaceTake(scene.id, e.target.files?.[0])} />
              <button type="button" className="secondary-button" onClick={e => { e.preventDefault(); playerRef.current?.pause(); if (playerRef.current) playerRef.current.currentTime = scene.start_time; setSeconds(scene.start_time); }}>Preview scene</button>
            </label>)}
          </section>
          <section className="production-provider-note" style={{ marginTop: 24 }}>
            <h2>Export local animatic</h2>
            <p>Exports a real-time 720p cut from the imported still images and the matching song, where device video capture is supported. Imported video clips are preview-only in this version. Keep BeatVision in the foreground until capture finishes.</p>
            {isVideoSelected && <p role="status">Replace video clips with still images to enable this animatic export.</p>}
            {!mime && <p role="status">This WebView has no supported video recording codec. Local preview still works; export is unavailable on this device.</p>}
            <button className="primary-button" disabled={!canExport} onClick={() => void exportCut()}>{rendering ? "Recording local cut…" : "Export local cut (no provider)"}</button>
            {exportUrl && <p><a className="secondary-button" href={exportUrl} download={"beatvision-local-cut." + (mime?.includes("mp4") ? "mp4" : "webm")}>Save rendered video</a></p>}
            <p>Local output is not written to generation_jobs, approved assets, or final_videos. An exported file does not change Vision Lock or production approval.</p>
          </section>
        </>}
        <canvas ref={canvasRef} style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} aria-hidden="true" />
      </main>
    </div>
  );
}
