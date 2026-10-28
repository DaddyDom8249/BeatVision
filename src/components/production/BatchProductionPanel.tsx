import RevisionMediaPanel from "./RevisionMediaPanel";
import { inspectMotionDirection } from "../../../supabase/functions/beatvision-generation/shot-direction";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/client";
import { approvalCandidates, approveBatch, type BatchKind, type BatchProgress } from "../../lib/batchProduction";
import { getCreativeErrorMessage } from "../../lib/formatCreativeText";

import type { VisualPlanScene } from "../../types/visualPlan";

const IMAGE_BUDGET_MESSAGE = "Scene image rendering is paused to protect Cloudflare neurons. Your saved images and motion remain available. No image generation was submitted.";

async function requireImageBudget(projectId: string): Promise<void> {
  const response = await supabase.functions.invoke("beatvision-generation", {
    body: { action: "image_capability", projectId },
  });
  if (response.error || response.data?.image_generation_authorized !== true) {
    throw new Error(IMAGE_BUDGET_MESSAGE);
  }
}

type Candidate = { scene: VisualPlanScene; asset: any; url: string; selected: boolean; previewError: boolean };
export default function BatchProductionPanel({ projectId, planId, scenes, disabled, onBusy, onRefresh }:
  { projectId: string; planId: string; scenes: VisualPlanScene[]; disabled: boolean;
    onBusy: (busy: boolean) => void; onRefresh: () => Promise<void> }) {
  const [running, setRunning] = useState(false);
  const [reuseBlocked,setReuseBlocked] = useState(true);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [review, setReview] = useState<{ kind: BatchKind; candidates: Candidate[] } | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [progressError, setProgressError] = useState<string | null>(null);
  const progressVersion = useRef(0);
  const life = useRef(0);
  const stop = useRef(true);
  const active = useRef(false);
  useEffect(() => {
    life.current++; stop.current = false;
    setProgress(null); setError(null); setReview(null); setReviewed(false); setBatches([]);
    return () => { life.current++; stop.current = true; onBusy(false); };
  }, [projectId, planId]);
  const refreshProgress = useCallback(async () => {
    const epoch = life.current, version = ++progressVersion.current;
    const response = await supabase.rpc("get_generation_batch_progress", {p_plan_id: planId});
    if (epoch !== life.current || version !== progressVersion.current) return;
    if (response.error || !Array.isArray(response.data)) {
      setProgressError("Saved batch progress is temporarily unavailable. Rendering does not depend on this page.");
      return;
    }
    setBatches(response.data); setProgressError(null);
  }, [planId]);
  useEffect(() => {
    let mounted = true;
    void refreshProgress().catch(() => {if(mounted) setProgressError("Could not load saved batch progress. Reopen this page to check again.");});
    const timer = window.setInterval(() => { void refreshProgress().catch(() => undefined); }, 5000);
    return () => {mounted=false; window.clearInterval(timer); progressVersion.current++;};
  }, [projectId, refreshProgress]);
  const requests = scenes.map(scene => ({scene, ...inspectMotionDirection({...scene})}));
  const directionIssues = requests.filter(request => request.issue);
  const serverRunning = batches.some(batch => batch.status === "running");
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
        const message = getCreativeErrorMessage(reason, "Batch paused. Check saved jobs before resuming.");
        setError(message.includes("BATCH_APPROVED_IMAGE_REQUIRED") ? "Approve a stored image for every scene before starting all motion clips. No partial batch was queued."
          : message.includes("BATCH_INDIVIDUAL_RETRY_REQUIRED") ? "A scene needs an individual regeneration. Finish that scene, then resume the batch. No automatic retry was sent."
          : message.includes("BATCH_SHORT_SHOT_REVISION_REQUIRED") ? "Create and lock the 5-second shot revision before starting all motion clips."
          : message);
        await onRefresh().catch(() => undefined);
      }
    } finally {
      active.current = false;
      if (life.current === epoch) { setRunning(false); onBusy(false); }
    }
  }
  function generate(kind: BatchKind) {
    setReview(null); setReviewed(false);
    void operation(async (stopped, update) => {
      update({done:0,total:scenes.length,message:"Saving the complete server batch…"});
      if (kind === "motion") {
        if (directionIssues.length) throw new Error("Review the motion requests and give each shot a clear action before rendering.");
        if (!terms || !shortShots) throw new Error("Accept the LTX license and lock a 5-second shot revision first.");
        const probe = await supabase.functions.invoke("beatvision-generation", {body:{action:"modal_capability",projectId}});
        if (probe.error || !probe.data?.modal_available || !probe.data?.modal_supported)
          throw new Error("Modal GPU is unavailable. No batch motion was submitted.");
      }
      if (kind === "image") await requireImageBudget(projectId);
      if (stopped()) return;
      const response = await supabase.rpc("start_generation_batch", {p_plan_id:planId,p_kind:kind,p_accepted_terms:kind === "motion" && terms});
      if (response.error) throw response.error;
      if (!response.data?.id) throw new Error("No saved batch was returned. Reopen this page before retrying.");
      if (!stopped()) {setProgress(null); await refreshProgress();}
    });
  }
  function setPaused(batch: any, paused: boolean) {
    void operation(async () => {
      if (batch.kind === "image" && !paused) await requireImageBudget(projectId);
      const response = await supabase.rpc("set_generation_batch_paused",{p_batch_id:batch.id,p_paused:paused});
      if (response.error) throw response.error;
      await refreshProgress();
    });
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
    <RevisionMediaPanel key={planId} projectId={projectId} planId={planId} disabled={disabled||running} onCheck={setReuseBlocked} onRefresh={async()=>{await refreshProgress();await onRefresh();}} />
    <h2>Produce all scenes</h2>
    <p>Generate missing media one scene at a time. Existing images and clips are kept. Review and approve images before generating motion. Individual regeneration remains available below.</p>
    <p role="status">New scene images require an approved AI budget. If unavailable, requests stop before any job or provider call. Saved images and motion remain usable.</p>
    <p>Batches run on the server, even after you leave this page or close the browser. Return here to see saved progress. The scheduler checks about once a minute. Pause stops later scenes; an already submitted job may finish. Failures pause the batch; retry that scene individually, then Resume.</p>
    <div className="production-actions">
      <button className="primary-button" disabled={blocked || serverRunning || reuseBlocked} onClick={() => generate("image")}>Generate All Scene Images</button>
      <button className="secondary-button" disabled={blocked} onClick={() => loadReview("image")}>Review &amp; Approve All Images</button>
    </div>
    <label><input type="checkbox" checked={terms} disabled={blocked} onChange={e => setTerms(e.target.checked)} /> I agree to the <a href="https://huggingface.co/Lightricks/LTX-Video/blob/main/LTX-Video-Open-Weights-License-0.X.txt" target="_blank" rel="noreferrer">LTX license and use restrictions</a>, including AI disclosure.</label>
    <details>
      <summary>Review motion requests · {directionIssues.length ? `${directionIssues.length} need direction` : `${requests.length} direction checks passed`}</summary>
      <p>These requests use your saved action and camera fields. The approved image carries appearance. Missing or ambiguous details are blocked; nothing is invented to fill them. Image approval and provider limits are checked separately at submission. Model output still needs your review.</p>
      {requests.map(request => <article key={request.scene.id}>
        <h3>Scene {request.scene.scene_number}: {request.scene.title}</h3>
        {request.issue ? <p className="form-error">{request.issue}</p> : <p style={{whiteSpace:"pre-wrap"}}>{request.prompt}</p>}
      </article>)}
      <a href={`/projects/${projectId}/visual-plan?plan=${planId}&help=directions`}>Beginner help: fix these shot directions</a>
    </details>
    {directionIssues.length > 0 && <p role="status">{directionIssues.length} shots need clear direction. Use <a href={`/projects/${projectId}/visual-plan?plan=${planId}&help=directions`}>Beginner help</a> to choose a fix or write your own. Motion generation and batch resume stay blocked until directions are corrected.</p>}
    <p>Motion uses Modal and your configured GPU budget. Clips are up to 5 seconds, aligned to each shot. This does not approve media or assemble the final video.</p>
    {!shortShots && <p>Create and lock a <a href={`/projects/${projectId}/visual-plan?plan=${planId}`}>5-second shot revision</a> before generating all motion.</p>}
    <div className="production-actions">
      <button className="primary-button" disabled={blocked || serverRunning || !terms || !shortShots || directionIssues.length > 0} onClick={() => generate("motion")}>Generate All 5-Second Motion Clips</button>
      <button className="secondary-button" disabled={blocked} onClick={() => loadReview("motion")}>Review &amp; Approve All Motion</button>
      {running && <button className="secondary-button" onClick={() => {stop.current = true;}}>Stop Review / Approval</button>}
    </div>
    {progressError && <p role="status">{progressError}</p>}
    {batches.map(batch => <div key={batch.id} role="status" aria-live="polite">
      <label>{batch.kind === "image" ? "Scene images" : "Motion clips"}: {batch.done} of {batch.total} · {batch.status}
        <progress aria-label={batch.kind === "image" ? "Scene image batch progress" : "Motion batch progress"} value={batch.done} max={Math.max(1,batch.total)} style={{width:"100%"}} />
      </label>
      {batch.current_scene && batch.status !== "completed" && <p>Current scene: {batch.current_scene}.{batch.failed > 0 ? " A saved job failed. Regenerate it individually, then resume this batch." : " Progress is saved on the server."}</p>}
      {batch.status !== "completed" && <button className="secondary-button" disabled={blocked || (batch.kind === "image" && reuseBlocked) || (batch.kind === "motion" && batch.status !== "running" && directionIssues.length > 0)} onClick={() => setPaused(batch,batch.status === "running")}>
        {batch.status === "running" ? "Pause" : "Resume"} {batch.kind === "image" ? "Image" : "Motion"} Batch
      </button>}
    </div>)}
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
