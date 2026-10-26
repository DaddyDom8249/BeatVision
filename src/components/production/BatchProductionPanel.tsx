import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/client";
import { generateBatch, approvalCandidates, approveBatch, type BatchKind, type BatchProgress } from "../../lib/batchProduction";
import { getCreativeErrorMessage } from "../../lib/formatCreativeText";
import type { VisualPlanScene } from "../../types/visualPlan";

type Candidate = { scene: VisualPlanScene; asset: any; url: string; selected: boolean; previewError: boolean };
export default function BatchProductionPanel({ projectId, planId, scenes, disabled, onBusy, onRefresh }:
  { projectId: string; planId: string; scenes: VisualPlanScene[]; disabled: boolean;
    onBusy: (busy: boolean) => void; onRefresh: () => Promise<void> }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [review, setReview] = useState<{ kind: BatchKind; candidates: Candidate[] } | null>(null);
  const life = useRef(0);
  const stop = useRef(true);
  const active = useRef(false);
  useEffect(() => {
    life.current++; stop.current = false;
    setProgress(null); setError(null); setReview(null); setReviewed(false);
    return () => { life.current++; stop.current = true; onBusy(false); };
  }, [projectId, planId]);
  const shortShots = scenes.every(s => Number.isFinite(s.end_time-s.start_time) && s.end_time > s.start_time && s.end_time-s.start_time <= 5.000001);

  async function operation(work: (stopped: () => boolean, update: (value: BatchProgress) => void) => Promise<void>) {
    if (active.current || disabled) return;
    const epoch = life.current;
    const stopped = () => stop.current || life.current !== epoch;
    active.current = true; stop.current = false;
    setRunning(true); onBusy(true); setError(null);
    const update = (value: BatchProgress) => { if (life.current === epoch) setProgress(value); };
    try {
      await work(stopped, update);
      if (life.current === epoch) {
        setProgress(value => value ? { ...value, message: stopped()
          ? "Paused. Saved jobs and approvals are kept. Resume to check remaining scenes."
          : value.done === value.total ? "Batch finished. Saved results are ready to review." : value.message } : value);
        await onRefresh();
      }
    } catch (reason) {
      if (life.current === epoch) {
        setError(getCreativeErrorMessage(reason, "Batch paused. Check saved jobs before resuming."));
        await onRefresh().catch(() => undefined);
      }
    } finally {
      active.current = false;
      if (life.current === epoch) { setRunning(false); onBusy(false); }
    }
  }
  function generate(kind: BatchKind) {
    setReview(null); setReviewed(false);
    void operation((stopped, update) => generateBatch({ db: supabase, projectId, planId, scenes, kind,
      acceptedTerms: terms, stopped, progress: update, wait: () => new Promise(resolve => window.setTimeout(resolve, 5000)) }));
  }
  function loadReview(kind: BatchKind) {
    setReview(null); setReviewed(false);
    void operation(async (stopped, update) => {
      update({done: 0, total: scenes.length, message: "Finding saved candidates…"});
      const candidates = await approvalCandidates(supabase, projectId, planId, scenes, kind);
      const prepared: Candidate[] = [];
      for (const candidate of candidates) {
        if (stopped()) return;
        let url = "";
        let previewError = false;
        try {
          const response = await supabase.functions.invoke("beatvision-generation", {body: {
            action: kind === "image" ? "image_url" : "motion_url", projectId, assetId: candidate.asset.id,
          }});
          if (response.error) throw response.error;
          url = String(kind === "image" ? response.data?.image_url || "" : response.data?.video_url || "");
          if (!url) throw new Error("Preview unavailable");
        } catch { previewError = true; }
        prepared.push({ ...candidate, url, selected: !previewError, previewError });
        update({done: prepared.length, total: candidates.length, message: "Loading review previews…"});
      }
      if (!stopped()) {
        setReview({kind, candidates: prepared});
        update({done: prepared.length, total: prepared.length, message: candidates.length
          ? "Review the selected candidates below before approving." : "No unapproved candidates. Existing approved takes are kept."});
      }
    });
  }
  const selected = review?.candidates.filter(c => c.selected && !c.previewError) ?? [];
  const blocked = disabled || running;
  function failPreview(id: string) {
    setReviewed(false);
    setReview(current => current ? { ...current, candidates: current.candidates.map(c => c.asset.id === id
      ? {...c, previewError: true, selected: false} : c) } : current);
  }
  return <section className="style-section" aria-label="Batch scene production">
    <h2>Produce all scenes</h2>
    <p>Generate missing media one scene at a time. Existing images and clips are kept. Review and approve images before generating motion. Individual regeneration remains available below.</p>
    <p>Keep this page open for the batch. Pause stops new requests; an already submitted job may finish. After reopening, use the same Generate All button to resume. Provider failures stop the batch; failed scenes need an individual retry.</p>
    <div className="production-actions">
      <button className="primary-button" disabled={blocked} onClick={() => generate("image")}>Generate All Scene Images</button>
      <button className="secondary-button" disabled={blocked} onClick={() => loadReview("image")}>Review &amp; Approve All Images</button>
    </div>
    <label><input type="checkbox" checked={terms} disabled={blocked} onChange={e => setTerms(e.target.checked)} /> I agree to the <a href="https://huggingface.co/Lightricks/LTX-Video/blob/main/LTX-Video-Open-Weights-License-0.X.txt" target="_blank" rel="noreferrer">LTX license and use restrictions</a>, including AI disclosure.</label>
    <p>Motion uses Modal and your configured GPU budget. Clips are up to 5 seconds, aligned to each shot. This does not approve media or assemble the final video.</p>
    {!shortShots && <p>Create and lock a <a href={`/projects/${projectId}/visual-plan?plan=${planId}`}>5-second shot revision</a> before generating all motion.</p>}
    <div className="production-actions">
      <button className="primary-button" disabled={blocked || !terms || !shortShots} onClick={() => generate("motion")}>Generate All 5-Second Motion Clips</button>
      <button className="secondary-button" disabled={blocked} onClick={() => loadReview("motion")}>Review &amp; Approve All Motion</button>
      {running && <button className="secondary-button" onClick={() => {stop.current = true;}}>Pause Batch</button>}
    </div>
    {progress && <div role="status" aria-live="polite">
      <label>Batch progress: {progress.done} of {progress.total}<progress aria-label="Batch progress" value={progress.done} max={Math.max(1, progress.total)} style={{width:"100%"}} /></label>
      <p>{progress.message}</p>
    </div>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {review && review.candidates.length > 0 && <div>
      <h3>Review {review.kind === "image" ? "images" : "motion clips"}</h3>
      <p>Newest pending candidate per scene. Approved scenes are skipped. Uncheck anything you want to review or regenerate individually.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))",gap:16}}>
        {review.candidates.map(candidate => <article key={candidate.asset.id}>
          <label><input type="checkbox" checked={candidate.selected} disabled={blocked || candidate.previewError}
            onChange={e => {setReviewed(false); setReview({...review, candidates: review.candidates.map(c => c.asset.id === candidate.asset.id ? {...c,selected:e.target.checked}:c)});}} /> Scene {candidate.scene.scene_number}: {candidate.scene.title}</label>
          {candidate.previewError ? <p>Preview unavailable. Review this scene individually.</p> : review.kind === "image"
            ? <img src={candidate.url} alt={`Scene ${candidate.scene.scene_number} candidate`} loading="lazy" onError={() => failPreview(candidate.asset.id)} style={{width:"100%",borderRadius:12}} />
            : <video src={candidate.url} controls playsInline preload="none" onError={() => failPreview(candidate.asset.id)} style={{width:"100%",borderRadius:12}} />}
        </article>)}
      </div>
      <label><input type="checkbox" checked={reviewed} disabled={blocked || !selected.length} onChange={e => setReviewed(e.target.checked)} /> I reviewed the {selected.length} selected {review.kind === "image" ? "images" : "motion clips"} and approve them.</label>
      <button className="primary-button" disabled={blocked || !reviewed || !selected.length} onClick={() => {
        const kind = review.kind;
        setReviewed(false);
        void operation(async (stopped, update) => {
          update({done:0,total:selected.length,message:"Saving reviewed approvals…"});
          await approveBatch({db:supabase,projectId,planId,kind,candidates:selected,stopped,progress:update});
          if (!stopped()) setReview(null);
        });
      }}>Approve All Reviewed {review.kind === "image" ? "Images" : "Motion Clips"}</button>
    </div>}
  </section>;
}
