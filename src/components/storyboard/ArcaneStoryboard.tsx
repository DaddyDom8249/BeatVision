import { useEffect, useState } from 'react';
import type { VisualPlanScene } from '../../types/visualPlan';
import { supabase } from '../../lib/supabase/client';
import { useAppearance } from '../../theme/ThemeProvider';

interface PreviewAsset { id: string; scene_id: string; image_url: string | null; storage_path: string | null; approved: boolean; status: string }
function time(seconds: number) {
  const ticks = Math.max(0, Math.round(seconds * 100));
  return `${String(Math.floor(ticks / 6000)).padStart(2, '0')}:${((ticks % 6000) / 100).toFixed(2).padStart(5, '0')}`;
}
function validImage(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  try { const url = new URL(value, window.location.origin); return url.protocol === 'https:' || url.origin === window.location.origin ? url.href : null; }
  catch { return null; }
}

export default function ArcaneStoryboard({ projectId, planId, scenes }: { projectId: string; planId?: string; scenes: VisualPlanScene[] }) {
  const { preference, reducedMotion } = useAppearance();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [unavailable, setUnavailable] = useState<Record<string, boolean>>({});
  const [loadedScope, setLoadedScope] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const scope = `${projectId}/${planId ?? ''}`;
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
        const urls: Record<string, string> = {};
        const failed: Record<string, boolean> = {};
        const assets = [...unique.values()];
        // Bound concurrent private-playback refreshes; this never submits generation.
        for (let start = 0; start < assets.length && active; start += 4) {
          await Promise.all(assets.slice(start, start + 4).map(async asset => {
            try {
              let image = asset.image_url;
              if (asset.storage_path) {
                const refreshed = await supabase.functions.invoke('beatvision-generation', { body: { action: 'image_url', projectId, assetId: asset.id } });
                if (refreshed.error) throw refreshed.error;
                image = refreshed.data?.image_url;
              }
              const valid = validImage(image);
              if (valid) urls[asset.scene_id] = valid;
              else failed[asset.scene_id] = true;
            } catch { failed[asset.scene_id] = true; }
          }));
        }
        if (active) { setPreviews(urls); setUnavailable(failed); setLoadedScope(scope); }
      } catch {
        if (active) setError('Saved image previews are unavailable. Scene direction remains editable below.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [preference.theme, projectId, planId, revision, scope]);

  if (preference.theme !== 'arcane' || !planId || !scenes.length) return null;
  const selected = scenes.find(scene => scene.id === selectedId) ?? scenes[0];
  const images = loadedScope === scope ? previews : {};
  const preview = images[selected.id];
  const emptyLabel = (sceneId: string) => loading ? 'Loading preview...' : error || unavailable[sceneId] ? 'Preview unavailable' : 'No approved image';
  const imageFailed = (sceneId: string) => {
    setPreviews(current => { const next = { ...current }; delete next[sceneId]; return next; });
    setUnavailable(current => ({ ...current, [sceneId]: true }));
  };
  return <section className="arcane-storyboard" aria-label="Storyboard Studio">
    <header className="arcane-storyboard-header"><div><span className="eyebrow">STORYBOARD STUDIO</span><h2>Scene Director</h2></div>
      <button type="button" className="secondary-button" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? 'Loading previews...' : 'Refresh previews'}</button>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="arcane-storyboard-scenes" aria-label="Storyboard scenes">
      {scenes.map(scene => <button key={scene.id} type="button" aria-pressed={selected.id === scene.id}
        className="arcane-storyboard-scene" onClick={() => setSelectedId(scene.id)}>
        <span className="arcane-storyboard-thumbnail">
          {images[scene.id] ? <img src={images[scene.id]} alt="" loading="lazy" onError={() => imageFailed(scene.id)} />
            : <span>{emptyLabel(scene.id)}</span>}
        </span>
        <span className="arcane-scene-number">Scene {String(scene.scene_number).padStart(2, '0')}</span>
        <strong>{scene.title}</strong>
        <small>{time(scene.start_time)} - {time(scene.end_time)}</small>
        <span className="arcane-scene-status">{scene.status === 'approved' ? 'Locked' : 'Draft'}</span>
      </button>)}
    </div>
    <div className="arcane-director-layout">
      <figure className="arcane-scene-preview">
        <div>{preview ? <img src={preview} alt={selected.title} onError={() => imageFailed(selected.id)} />
          : <p>{emptyLabel(selected.id)}</p>}</div>
        <figcaption>{selected.title} <span>{time(selected.start_time)} - {time(selected.end_time)}</span></figcaption>
      </figure>
      <div className="arcane-director-summary">
        <span className="eyebrow">{selected.status === 'approved' ? 'LOCKED DIRECTION' : 'DRAFT DIRECTION'}</span>
        <h3>Scene {selected.scene_number}</h3>
        <dl><dt>Camera</dt><dd>{selected.camera_direction || 'Not specified'}</dd>
          <dt>Scene</dt><dd>{selected.visual_direction || 'Not specified'}</dd>
          <dt>Location</dt><dd>{selected.location || 'Not specified'}</dd></dl>
        <button type="button" className="primary-button" onClick={() => {
          const editor = document.getElementById(`scene-director-${selected.id}`);
          editor?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
          editor?.focus({ preventScroll: true });
        }}>{selected.status === 'approved' ? 'Review scene direction' : 'Edit scene direction'}</button>
      </div>
    </div>
  </section>;
}
