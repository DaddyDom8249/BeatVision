import { useEffect, useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { VisualPlanScene } from '../../types/visualPlan';
import { supabase } from '../../lib/supabase/client';
import { useAppearance } from '../../theme/ThemeProvider';

interface PreviewAsset { id: string; scene_id: string; image_url: string | null; storage_path: string | null; approved: boolean; status: string }
interface MotionAsset { id: string; scene_id: string; video_url: string | null; provider: string; model: string; approved: boolean; status: string }
interface CurrentMedia {
  sceneId: string;
  image?: { url: string; status: string };
  motion?: { id: string; url: string; status: string; label: string };
  state?: string;
}
interface StoryboardProps {
  projectId: string;
  planId?: string;
  scenes: VisualPlanScene[];
  selectedSceneId?: string | null;
  onSceneSelect?: (id: string) => void;
  onOpenDirector?: (id: string) => void;
  lockedContext?: Record<string, unknown> | null;
  currentMedia?: CurrentMedia;
  disabled?: boolean;
}
function time(seconds: number) {
  const ticks = Math.max(0, Math.round(seconds * 100));
  return String(Math.floor(ticks / 6000)).padStart(2, '0') + ':' + ((ticks % 6000) / 100).toFixed(2).padStart(5, '0');
}
function validMedia(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  try { const url = new URL(value, window.location.origin); return url.protocol === 'https:' || url.origin === window.location.origin ? url.href : null; }
  catch { return null; }
}
function contextText(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value;
  if (depth > 3 || value === null || typeof value !== 'object') return '';
  if (Array.isArray(value)) return value.map(v => contextText(v, depth + 1)).filter(Boolean).join(' · ');
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string') return record.name;
  return Object.entries(record).map(([key, v]) => {
    const text = contextText(v, depth + 1); return text ? key.replaceAll('_', ' ') + ': ' + text : '';
  }).filter(Boolean).join(' · ');
}

/** Presentation only: saved-media reads and existing playback URL actions, never enqueue or approval. */
export default function ArcaneStoryboard({ projectId, planId, scenes, selectedSceneId, onSceneSelect, onOpenDirector, lockedContext, currentMedia, disabled = false }: StoryboardProps) {
  const { preference, reducedMotion } = useAppearance();
  const directorId = useId();
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [unavailable, setUnavailable] = useState<Record<string, boolean>>({});
  const [loadedScope, setLoadedScope] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [mediaMode, setMediaMode] = useState<'image' | 'motion'>('image');
  const [motionState, setMotionState] = useState<{ scope: string; clip: MotionAsset | null; loading: boolean; error: boolean }>({ scope: '', clip: null, loading: false, error: false });
  const [measured, setMeasured] = useState<{ key: string; seconds: number } | null>(null);
  const [failedVideo, setFailedVideo] = useState('');
  const [failedImage, setFailedImage] = useState('');
  const scope = projectId + '/' + (planId ?? '');
  const selected = scenes.find(scene => scene.id === (selectedSceneId ?? localSelection)) ?? scenes[0];
  const motionScope = scope + '/' + (selected?.id ?? '');
  const supplied = currentMedia?.sceneId === selected?.id ? currentMedia : undefined;

  useEffect(() => {
    if (preference.theme !== 'arcane' || !planId) return;
    let active = true;
    setLoading(true); setError(null); setPreviews({}); setUnavailable({}); setLoadedScope('');
    void (async () => {
      try {
        const result = await supabase.from('scene_image_assets')
          .select('id,scene_id,image_url,storage_path,approved,status')
          .eq('project_id', projectId).eq('visual_plan_id', planId)
          .eq('approved', true).eq('status', 'approved').order('created_at', { ascending: false });
        if (result.error) throw result.error;
        const unique = new Map<string, PreviewAsset>();
        for (const asset of (result.data ?? []) as PreviewAsset[]) {
          if (asset.approved && asset.status === 'approved' && !unique.has(asset.scene_id)) unique.set(asset.scene_id, asset);
        }
        const urls: Record<string, string> = {}, failed: Record<string, boolean> = {};
        const assets = [...unique.values()];
        for (let start = 0; start < assets.length && active; start += 4) {
          await Promise.all(assets.slice(start, start + 4).map(async asset => {
            try {
              let image = asset.image_url;
              if (asset.storage_path) {
                const refreshed = await supabase.functions.invoke('beatvision-generation', { body: { action: 'image_url', projectId, assetId: asset.id } });
                if (refreshed.error) throw refreshed.error;
                image = refreshed.data?.image_url;
              }
              const valid = validMedia(image);
              if (valid) urls[asset.scene_id] = valid; else failed[asset.scene_id] = true;
            } catch { failed[asset.scene_id] = true; }
          }));
        }
        if (active) { setPreviews(urls); setUnavailable(failed); setLoadedScope(scope); }
      } catch {
        if (active) setError('Saved image previews are unavailable. Scene direction remains available in the Director.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [preference.theme, projectId, planId, revision, scope]);

  // Fetch motion only after the creator requests it. Never substitute a still animation.
  useEffect(() => {
    if (preference.theme !== 'arcane' || !planId || !selected?.id || mediaMode !== 'motion' || supplied) return;
    let active = true;
    setMotionState({ scope: motionScope, clip: null, loading: true, error: false });
    void (async () => {
      try {
        const result = await supabase.from('motion_clip_assets')
          .select('id,scene_id,video_url,provider,model,approved,status')
          .eq('project_id', projectId).eq('visual_plan_id', planId).eq('scene_id', selected.id)
          .eq('approved', true).eq('status', 'approved').order('created_at', { ascending: false });
        if (result.error) throw result.error;
        let clip = ((result.data ?? []) as MotionAsset[]).find(asset => asset.scene_id === selected.id && asset.approved && asset.status === 'approved') ?? null;
        if (clip?.provider === 'huggingface-zerogpu') {
          const refreshed = await supabase.functions.invoke('beatvision-generation', { body: { action: 'motion_url', projectId, assetId: clip.id } });
          if (refreshed.error) throw refreshed.error;
          clip = { ...clip, video_url: refreshed.data?.video_url };
        }
        if (clip && !validMedia(clip.video_url)) throw new Error('Saved motion URL unavailable');
        if (active) setMotionState({ scope: motionScope, clip, loading: false, error: false });
      } catch { if (active) setMotionState({ scope: motionScope, clip: null, loading: false, error: true }); }
    })();
    return () => { active = false; };
  }, [preference.theme, projectId, planId, selected?.id, mediaMode, motionScope, revision, supplied]);

  if (preference.theme !== 'arcane' || !planId || !scenes.length || !selected) return null;
  const images = loadedScope === scope ? previews : {};
  const suppliedImage = validMedia(supplied?.image?.url);
  const preview = suppliedImage ?? images[selected.id];
  const previewKey = motionScope + '/' + preview + '/' + revision;
  const imageAvailable = Boolean(preview && (suppliedImage ? failedImage !== previewKey : !unavailable[selected.id]));
  const motion = motionState.scope === motionScope ? motionState.clip : null;
  const videoUrl = validMedia(supplied?.motion?.url ?? motion?.video_url);
  const videoKey = motionScope + '/' + (supplied?.motion?.id ?? motion?.id ?? '') + '/' + revision;
  const video = failedVideo !== videoKey ? videoUrl : null;
  const actualDuration = measured?.key === videoKey ? measured.seconds : null;
  const sceneDuration = Math.max(0, selected.end_time - selected.start_time);
  const motionLabel = supplied?.motion?.label ?? (motion?.model === 'image-motion' ? 'Procedural image animation · not AI subject motion' : motion?.provider === 'huggingface-zerogpu' ? 'Saved AI-generated motion' : 'Saved motion · provider provenance not verified here');
  const emptyLabel = (sceneId: string) => loading ? 'Loading preview...' : error || unavailable[sceneId] ? 'Preview unavailable' : 'No approved image';
  const imageFailed = (sceneId: string) => {
    setPreviews(current => { const next = { ...current }; delete next[sceneId]; return next; });
    setUnavailable(current => ({ ...current, [sceneId]: true }));
  };
  const index = scenes.findIndex(scene => scene.id === selected.id);
  function select(id: string) { setLocalSelection(id); onSceneSelect?.(id); }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, i: number) {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? scenes.length - 1 : event.key === 'ArrowRight' ? Math.min(scenes.length - 1, i + 1) : event.key === 'ArrowLeft' ? Math.max(0, i - 1) : null;
    if (next === null) return;
    event.preventDefault(); select(scenes[next].id);
    event.currentTarget.closest('ol')?.querySelectorAll<HTMLButtonElement>('.arcane-storyboard-scene')[next]?.focus();
  }
  const characters = contextText(lockedContext?.characters);
  const lighting = contextText((lockedContext?.style_bible as Record<string, unknown> | undefined)?.color_lighting ?? (lockedContext?.world as Record<string, unknown> | undefined)?.color_lighting);
  return <section className="arcane-storyboard" aria-label="Storyboard Studio">
    <header className="arcane-storyboard-header">
      <div><span className="eyebrow">STORYBOARD STUDIO</span><h2>Every scene. One world.</h2><p>Select a frame to preview its saved media and direct the scene.</p></div>
      <button type="button" className="secondary-button" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? 'Loading previews...' : 'Refresh previews'}</button>
    </header>
    <div className="arcane-sequence-meta"><span>{String(scenes.length).padStart(2, '0')} scenes</span><span>{time(scenes[0].start_time)} - {time(scenes[scenes.length - 1].end_time)}</span><span>{scenes.filter(s => s.status === 'approved').length} directions locked</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <ol className="arcane-storyboard-scenes" aria-label="Storyboard scenes">
      {scenes.map((scene, i) => <li key={scene.id} className="arcane-storyboard-item">
        <button type="button" aria-label={'Scene ' + scene.scene_number + ': ' + scene.title} aria-pressed={selected.id === scene.id}
          disabled={disabled} className="arcane-storyboard-scene" onClick={() => select(scene.id)} onKeyDown={event => navigate(event, i)}>
          <span className="arcane-storyboard-thumbnail">
            {images[scene.id] ? <img src={images[scene.id]} alt="" loading="lazy" onError={() => imageFailed(scene.id)} /> : <span className="arcane-empty-media"><span aria-hidden="true">◇</span>{emptyLabel(scene.id)}</span>}
            <span className="arcane-scene-number">{String(scene.scene_number).padStart(2, '0')}</span>
            <span className="arcane-scene-status">{scene.status === 'approved' ? 'Locked direction' : 'Draft direction'}</span>
            {selected.id === scene.id && <span className="arcane-scene-selected">Selected</span>}
          </span>
          <span className="arcane-scene-body"><strong>{scene.title}</strong><span className="arcane-scene-camera">{scene.camera_direction || 'Camera not specified'}</span>
            <span className="arcane-scene-description">{scene.visual_direction || 'No saved visual direction.'}</span>
            <span className="arcane-scene-timing"><small>{time(scene.start_time)} - {time(scene.end_time)}</small><span>{Math.max(0, scene.end_time - scene.start_time).toFixed(2)}s</span></span>
            <span className="arcane-scene-production">{images[scene.id] ? 'Approved image' : emptyLabel(scene.id)}</span>
          </span>
        </button>
      </li>)}
    </ol>
    <div className="arcane-sequence-bridge" aria-hidden="true"><span>◇</span></div>
    <figure className="arcane-scene-preview" aria-label="Selected scene preview">
      <div className="arcane-preview-toolbar"><span className="eyebrow">SELECTED SCENE / {String(selected.scene_number).padStart(2, '0')}</span>
        <div className="arcane-media-switch" aria-label="Preview media"><button type="button" aria-pressed={mediaMode === 'image'} onClick={() => setMediaMode('image')}>Image</button><button type="button" aria-pressed={mediaMode === 'motion'} onClick={() => setMediaMode('motion')}>Motion</button></div>
      </div>
      <div className="arcane-preview-screen">
        {mediaMode === 'image' ? imageAvailable ? <img src={preview} alt={selected.title} onError={() => { setFailedImage(previewKey); if (!suppliedImage) imageFailed(selected.id); }} /> : <div className="arcane-preview-empty"><span aria-hidden="true">◇</span><h3>{failedImage === previewKey ? 'Preview unavailable' : emptyLabel(selected.id)}</h3><p>Real scene imagery will appear here when it is available and approved.</p></div>
          : video ? <video key={videoKey} src={video} controls playsInline preload="metadata" aria-label={selected.title + ' saved motion'} onLoadedMetadata={event => {
            const seconds = event.currentTarget.duration; if (Number.isFinite(seconds) && seconds > 0) setMeasured({ key: videoKey, seconds });
          }} onError={() => setFailedVideo(videoKey)} /> : <div className="arcane-preview-empty"><span aria-hidden="true">◇</span><h3>{motionState.scope === motionScope && motionState.loading && !supplied ? 'Loading saved motion...' : (motionState.scope === motionScope && motionState.error) || failedVideo === videoKey ? 'Motion preview unavailable' : 'No approved motion clip'}</h3><p>A playable preview requires a real saved video. Viewing this board never starts generation.</p></div>}
      </div>
      <figcaption><div><h3>{selected.title}</h3><p>{time(selected.start_time)} - {time(selected.end_time)} · {sceneDuration.toFixed(2)}s planned</p><p className="arcane-preview-state">{supplied?.state ?? (mediaMode === 'image' ? imageAvailable ? (supplied?.image?.status ?? 'Approved image') : failedImage === previewKey || unavailable[selected.id] || error ? 'Image preview unavailable' : 'Awaiting approved imagery' : video ? motionLabel : 'Awaiting playable motion')}</p>
        {mediaMode === 'motion' && video && <p role="status">{actualDuration === null ? 'Actual media duration not loaded yet.' : actualDuration.toFixed(2) + 's actual media' + (sceneDuration - actualDuration > 0.05 ? ' · ' + (sceneDuration - actualDuration).toFixed(2) + 's of this scene remains uncovered.' : '.')}</p>}</div>
        <nav className="arcane-preview-navigation" aria-label="Preview scene navigation"><button type="button" className="secondary-button" disabled={disabled || index === 0} onClick={() => select(scenes[index - 1].id)}>Previous scene</button><span>{index + 1} / {scenes.length}</span><button type="button" className="secondary-button" disabled={disabled || index === scenes.length - 1} onClick={() => select(scenes[index + 1].id)}>Next scene</button></nav>
      </figcaption>
    </figure>
    <details className="arcane-director-panel" id={directorId}>
      <summary><span><span className="eyebrow">{selected.status === 'approved' ? 'LOCKED DIRECTION' : 'DRAFT DIRECTION'}</span><strong>Scene Director</strong></span><span className="arcane-disclosure-hint">Expand <span aria-hidden="true">+</span></span></summary>
      <div className="arcane-director-content"><p className="arcane-director-intro">{selected.status === 'approved' ? 'This saved direction is locked. Changes require an editable plan revision.' : 'Review the saved direction, then open the scene editor to make changes.'}</p>
        <dl><div><dt>Scene description / visual direction</dt><dd>{selected.visual_direction || 'Not specified'}</dd></div><div><dt>Characters · locked context</dt><dd>{characters || 'No character context in this saved snapshot.'}</dd></div><div><dt>Environment</dt><dd>{selected.location || 'Not specified'}</dd></div><div><dt>Camera composition</dt><dd>{selected.camera_direction || 'Not specified'}</dd></div><div><dt>Camera / subject movement</dt><dd>{selected.movement_direction || 'Not specified'}</dd></div><div><dt>Mood and lighting</dt><dd>{selected.mood || 'Mood not specified'}{lighting ? ' · ' + lighting : ' · No separate lighting direction saved.'}</dd></div><div><dt>Continuity notes</dt><dd>{selected.continuity_notes || 'Not specified'}</dd></div><div><dt>Lyric / musical moment</dt><dd>{selected.lyric_moment || 'Not specified'}</dd></div><div><dt>Transition</dt><dd>{selected.transition_style || 'Not specified'}</dd></div></dl>
        <button type="button" className="primary-button" onClick={() => {
          if (onOpenDirector) { onOpenDirector(selected.id); return; }
          const editor = document.getElementById('scene-director-' + selected.id);
          editor?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' }); editor?.focus({ preventScroll: true });
        }}>{selected.status === 'approved' ? 'Review scene direction' : 'Edit scene direction'}</button>
      </div>
    </details>
  </section>;
}
