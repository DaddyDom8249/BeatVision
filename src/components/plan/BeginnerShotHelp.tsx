import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/client";
import { inspectMotionDirection } from "../../../supabase/functions/beatvision-generation/shot-direction";
import { ACTION_OPTIONS, CAMERA_OPTIONS, proposeShotRepairs, saveShotRepairs, type RepairChoices, type ShotRepair } from "../../lib/guidedShotRepair";
import type { VisualPlanScene } from "../../types/visualPlan";

export default function BeginnerShotHelp({planId,locked,scenes,working,onCreateRevision,onSaved}:
  {planId:string;locked:boolean;scenes:VisualPlanScene[];working:boolean;onCreateRevision:()=>Promise<void>;onSaved:()=>Promise<void>}) {
  const [open,setOpen]=useState(()=>new URLSearchParams(window.location.search).get("help")==="directions");
  const [choices,setChoices]=useState<RepairChoices>({action:"",customAction:"",camera:"",customCamera:""});
  const [proposal,setProposal]=useState<ShotRepair[]|null>(null);
  const [reviewed,setReviewed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState<number|null>(null);
  const active=useRef(false),life=useRef(0);
  useEffect(()=>{life.current++;return()=>{life.current++;};},[planId]);
  useEffect(()=>{setProposal(null);setReviewed(false);},[scenes]);
  const affected=scenes.filter(scene=>inspectMotionDirection({...scene}).issue);
  const blocked=working||busy;
  function choose(key:keyof RepairChoices,value:string) {
    setChoices(old=>({...old,[key]:value}));setProposal(null);setReviewed(false);setSaved(null);setError("");
  }
  async function apply() {
    if(active.current||blocked||locked||!proposal||!reviewed)return;
    const epoch=life.current;active.current=true;setBusy(true);setError("");
    try {
      const count=await saveShotRepairs(supabase,planId,proposal);
      if(epoch!==life.current)return;
      setSaved(count);setProposal(null);setReviewed(false);await onSaved();
    } catch(reason) {if(epoch===life.current)setError(reason instanceof Error?reason.message:"Unable to save fixes.");}
    finally {active.current=false;if(epoch===life.current)setBusy(false);}
  }
  return <section className="style-section beginner-shot-help" aria-label="Beginner shot help">
    <button className="secondary-button" type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>Beginner help · fix shot directions</button>
    {open && <div>
      <h2>{affected.length ? `${affected.length} shots need clearer direction` : "Your saved shot directions pass this check"}</h2>
      <p>Some directions describe a mood or offer several different movements. The renderer needs a clear action for this shot. You can choose a simple approach for all affected shots, or write your own. This does not invent a new story or check visual quality.</p>
      {locked ? <div>
        <p>This plan is locked. Make an editable copy to fix directions while preserving your approved plan and footage. Review the new revision before locking it; generation is a separate step.</p>
        <button className="primary-button" type="button" disabled={blocked} onClick={()=>void onCreateRevision().catch(()=>undefined)}>Make an editable copy for these fixes</button>
      </div> : affected.length > 0 && <>
        <fieldset disabled={blocked}>
          <legend>1. What should the existing subject do?</legend>
          {ACTION_OPTIONS.map(option=><label key={option.id}><input type="radio" name={`action-${planId}`} checked={choices.action===option.id} onChange={()=>choose("action",option.id)} /> {option.label}</label>)}
          <label><input type="radio" name={`action-${planId}`} checked={choices.action==="custom"} onChange={()=>choose("action","custom")} /> Write my own action</label>
          {choices.action==="custom" && <label>My action<textarea rows={3} maxLength={200} value={choices.customAction} onChange={e=>choose("customAction",e.target.value)} placeholder="Describe one visible action for the existing subject." /></label>}
        </fieldset>
        <fieldset disabled={blocked}>
          <legend>2. How should the camera move?</legend>
          {CAMERA_OPTIONS.map(option=><label key={option.id}><input type="radio" name={`camera-${planId}`} checked={choices.camera===option.id} onChange={()=>choose("camera",option.id)} /> {option.label}</label>)}
          <label><input type="radio" name={`camera-${planId}`} checked={choices.camera==="custom"} onChange={()=>choose("camera","custom")} /> Write my own camera direction</label>
          {choices.camera==="custom" && <label>My camera direction<textarea rows={2} maxLength={140} value={choices.customCamera} onChange={e=>choose("customCamera",e.target.value)} /></label>}
        </fieldset>
        <p>The same selected action and camera will be proposed for all {affected.length} affected shots. Shots that already pass stay unchanged. Choose only movements that fit each shot and its approved imagery; use the individual editors for exceptions.</p>
        <button className="secondary-button" type="button" disabled={blocked} onClick={()=>{try{setProposal(proposeShotRepairs(scenes,choices));setReviewed(false);setError("");}catch(reason){setError(reason instanceof Error?reason.message:"Choose directions first.");}}}>Preview proposed fixes</button>
        {proposal && <div>
          <h3>Proposed draft fixes · {proposal.length} shots</h3>
          <p>{proposal[0].prompt}</p>
          <details><summary>Which shots will change?</summary><ul>{proposal.map(item=><li key={item.scene_id}>Scene {item.scene_number}</li>)}</ul></details>
          <p>Timing, story, setting and continuity notes are kept. This saves draft directions only; it does not approve assets, start rendering, or resume a paused batch.</p>
          <label><input type="checkbox" disabled={blocked} checked={reviewed} onChange={e=>setReviewed(e.target.checked)} /> I reviewed these choices and they fit the selected shots.</label>
          <button className="primary-button" type="button" disabled={blocked||!reviewed} onClick={()=>void apply()}>{busy?"Saving draft fixes…":`Save fixes to ${proposal.length} draft shots`}</button>
        </div>}
      </>}
      {saved!==null && <p role="status">Saved fixes to {saved} draft shots. Review the plan, then lock it when ready. No render was started.</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
    </div>}
  </section>;
}
