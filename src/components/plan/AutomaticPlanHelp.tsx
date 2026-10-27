import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/client";
import { preparePlanDirections, savePlanDirections, type PlanProposal } from "../../lib/automaticPlanDirection";
import type { VisualPlanScene } from "../../types/visualPlan";
export default function AutomaticPlanHelp({planId,locked,scenes,working,onCreateRevision,onSaved}:
  {planId:string;locked:boolean;scenes:VisualPlanScene[];working:boolean;onCreateRevision:()=>Promise<void>;onSaved:()=>Promise<void>}) {
  const [open,setOpen]=useState(()=>new URLSearchParams(window.location.search).get("help")==="directions" || (!locked && scenes.length>0));
  const [mode,setMode]=useState("literal"),[proposals,setProposals]=useState<PlanProposal[]>([]),[busy,setBusy]=useState(false);
  const [reviewed,setReviewed]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(0);
  const life=useRef(0),active=useRef(false);
  const signature=scenes.map(s=>`${s.id}:${s.updated_at}`).join("|");
  useEffect(()=>{life.current++;setProposals([]);setReviewed(false);setError("");return()=>{life.current++;};},[planId,signature]);
  useEffect(()=>setSaved(0),[planId]);
  async function prepare(){
    if(active.current||working||locked)return;const epoch=life.current;active.current=true;setBusy(true);setError("");setReviewed(false);setSaved(0);
    try{await preparePlanDirections(supabase,planId,scenes,mode,proposals,next=>{if(epoch===life.current)setProposals(next);},()=>epoch!==life.current);}
    catch(reason){if(epoch===life.current)setError(reason instanceof Error?reason.message:"Unable to prepare this plan.");}
    finally{active.current=false;setBusy(false);}
  }
  async function save(){
    if(active.current||working||locked||!reviewed||proposals.length!==scenes.length)return;
    active.current=true;setBusy(true);setError("");const epoch=life.current;
    try{const count=await savePlanDirections(supabase,planId,scenes,proposals);if(epoch!==life.current)return;
      setSaved(count);setProposals([]);setReviewed(false);await onSaved();}
    catch(reason){if(epoch===life.current)setError(reason instanceof Error?reason.message:"Unable to save the plan.");}
    finally{active.current=false;setBusy(false);}
  }
  const complete=proposals.length===scenes.length&&scenes.length>0;
  const estimated=proposals.filter(p=>["estimated_lyric_distribution","no_lyrics_available"].includes(p.timing.source)).length;
  return <section className="style-section" aria-label="Automatic beginner direction">
    <button type="button" className="primary-button" aria-expanded={open} onClick={()=>setOpen(!open)}>Prepare my entire AI storyboard</button>
    {open && <div>
      <h2>Let BeatVision direct the scenes</h2>
      <p>Your confirmed song interpretation, lyrics, mood and visual style guide the full video. BeatVision proposes every scene’s action, emotion, image details and camera; you keep or revise the choices. This uses an AI interpretation request and may be subject to provider allowances or costs. Nothing runs until you choose Prepare.</p>
      {locked?<><p>Your current plan and footage stay saved. Make an editable copy to prepare new directions.</p>
        <button type="button" className="secondary-button" disabled={working||busy} onClick={()=>void onCreateRevision().catch(()=>undefined)}>Make an editable copy</button></>:<>
        <label>How should the video tell the song?<select disabled={working||busy} value={mode} onChange={e=>{setMode(e.target.value);setProposals([]);setReviewed(false);setError("");}}>
          <option value="literal">Show what the lyrics describe</option><option value="mixed">Blend the story with symbolism</option><option value="symbolic">Express the meaning through symbolism</option>
        </select></label>
        <button type="button" className="primary-button" disabled={working||busy||complete||!scenes.length} onClick={()=>void prepare()}>
          {busy?`Preparing your video… ${proposals.length}/${scenes.length}`:proposals.length?"Continue preparing remaining scenes":`Prepare all ${scenes.length} scenes for me`}
        </button>
        {busy&&<p role="status">Keep this page open while BeatVision prepares the story. No images, motion or video are being generated.</p>}
        {proposals.length>0&&<>
          <p>{proposals.length} of {scenes.length} scenes prepared. {estimated>0?`${estimated} have estimated or unavailable lyric timing for your review.`:"Available transcript timing guides the lyric placement; exact synchronization still needs review."}</p>
          <details><summary>Review the proposed video story</summary><ol>{proposals.map(item=><li key={item.scene_id}>
            <strong>Scene {item.scene_number}</strong> — {item.scene_proposal.action} <span>Feeling: {item.scene_proposal.emotion}.</span>
            <details><summary>Scene details</summary><p>Lyrics: {item.scene_proposal.lyric_excerpt}</p><p>{item.scene_proposal.visual_direction}</p><p>Camera: {item.scene_proposal.camera}</p><p>{item.scene_proposal.uncertainty}</p></details>
          </li>)}</ol></details>
          {complete&&<><p>Saving replaces the action, camera, mood and image direction in every scene of this editable draft, including scenes you already changed manually. Review the full proposal first. Your earlier approved revisions and footage remain unchanged.</p>
            <label><input type="checkbox" disabled={working||busy} checked={reviewed} onChange={e=>setReviewed(e.target.checked)} /> I reviewed this proposed video plan.</label>
            <button type="button" className="primary-button" disabled={working||busy||!reviewed} onClick={()=>void save()}>Save all scene directions</button></>}
        </>}
      </>}
      {saved>0&&<p role="status">All {saved} scene directions are saved. Use Lock Visual Plan to continue. You do not need to fill out each scene.</p>}
      {error&&<p role="alert">{error} Prepared scenes stay here for this session; your saved plan has not been partly overwritten.</p>}
    </div>}
  </section>;
}
