import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/client";
import { CAMERA_OPTIONS, diagnoseShot, directionIssues, proposeSceneRepairs, readSceneDirections, saveShotRepairs, suggestSceneRepairs, type SceneDirections, type ShotRepair } from "../../lib/guidedShotRepair";
import type { VisualPlanScene } from "../../types/visualPlan";

export default function BeginnerShotHelp({planId,locked,scenes,working,onCreateRevision,onSaved}:
  {planId:string;locked:boolean;scenes:VisualPlanScene[];working:boolean;onCreateRevision:()=>Promise<void>;onSaved:()=>Promise<void>}) {
  const [open,setOpen]=useState(()=>new URLSearchParams(window.location.search).get("help")==="directions");
  const [edits,setEdits]=useState<Record<string,SceneDirections>>({});
  const [selected,setSelected]=useState("");
  const [showAll,setShowAll]=useState(false);
  const [proposal,setProposal]=useState<ShotRepair[]|null>(null);
  const [reviewed,setReviewed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState<number|null>(null);
  const active=useRef(false),life=useRef(0);
  useEffect(()=>{life.current++;setSaved(null);setSelected("");return()=>{life.current++;};},[planId]);
  useEffect(()=>{setEdits({});setProposal(null);setReviewed(false);},[planId,scenes]);
  const affected=scenes.filter(scene=>diagnoseShot(scene).needsAttention);
  const visible=showAll||!affected.length?scenes:affected;
  const scene=visible.find(item=>item.id===selected)||visible[0];
  const diagnosis=scene?diagnoseShot(scene):null;
  const values=scene?(edits[scene.id]||diagnosis!.directions):null;
  const currentIssues=values?directionIssues(values):null;
  const changed=scenes.filter(item=>edits[item.id] && JSON.stringify(edits[item.id])!==JSON.stringify(readSceneDirections(item)));
  const ready=changed.filter(item=>{const issue=directionIssues(edits[item.id]);return !issue.actor&&!issue.camera;});
  const repeated=scene?scenes.filter(item=>{const value=readSceneDirections(item);return value.actor===diagnosis!.directions.actor&&value.camera===diagnosis!.directions.camera;}).length:0;
  const suggestions=suggestSceneRepairs(scenes);
  const availableSuggestions=Object.keys(suggestions).filter(id=>!Object.hasOwn(edits,id));
  const blocked=working||busy;
  function choose(field:keyof SceneDirections,value:string) {
    if(!scene||!values)return;
    setEdits(old=>({...old,[scene.id]:{...values,[field]:value}}));
    setProposal(null);setReviewed(false);setSaved(null);setError("");
  }
  async function apply() {
    if(active.current||blocked||locked||!proposal||!reviewed)return;
    const epoch=life.current;active.current=true;setBusy(true);setError("");
    try {
      const count=await saveShotRepairs(supabase,planId,proposal);
      if(epoch!==life.current)return;
      setSaved(count);setEdits({});setProposal(null);setReviewed(false);await onSaved();
    } catch(reason) {if(epoch===life.current)setError(reason instanceof Error?reason.message:"Unable to save fixes.");}
    finally {active.current=false;if(epoch===life.current)setBusy(false);}
  }
  return <section className="style-section beginner-shot-help" aria-label="Beginner shot help">
    <button className="secondary-button" type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>Beginner help · fix shot directions</button>
    {open && <div>
      <h2>{affected.length ? `${affected.length} shots need clearer direction` : "Review each shot’s direction"}</h2>
      <p>Fix each shot using its own saved context. Clear instructions stay in place; suggestions come only from that shot’s explicit action text. Missing creative choices need your input. These checks cover instruction clarity, not visual quality.</p>
      {locked ? <div>
        <p>This plan is locked. Make an editable copy to fix directions while preserving your approved plan and footage. Compatible images can be reused after review; earlier motion remains in its original revision.</p>
        <button className="primary-button" type="button" disabled={blocked} onClick={()=>void onCreateRevision().catch(()=>undefined)}>Make an editable copy for these fixes</button>
      </div> : <>
        <p>{availableSuggestions.length} shots have a single clear fix available in their own saved instructions. Preparing these makes draft proposals for review. Missing or ambiguous choices still need your input.</p>
        <button className="secondary-button" type="button" disabled={blocked||!availableSuggestions.length} onClick={()=>{setEdits(old=>({...suggestions,...old}));setProposal(null);setReviewed(false);setSaved(null);setError("");}}>Prepare fixes from each scene’s saved text</button>
        {affected.length>0 && <label><input type="checkbox" checked={showAll} disabled={blocked} onChange={event=>setShowAll(event.target.checked)} /> Include shots that already pass, for individual changes</label>}
        {scene && diagnosis && values && <div className="beginner-scene-card">
          <label>Choose a scene<select disabled={blocked} value={scene.id} onChange={event=>setSelected(event.target.value)}>{visible.map(item=><option key={item.id} value={item.id}>Scene {item.scene_number} · {item.title}</option>)}</select></label>
          <h3>Scene {scene.scene_number} · {scene.title}</h3>
          <p>{scene.start_time.toFixed(1)}–{scene.end_time.toFixed(1)} seconds · {scene.location}</p>
          <details><summary>Saved scene context and continuity</summary><p>{scene.visual_direction || "No visual direction saved."}</p><p>{scene.continuity_notes || "No continuity notes saved."}</p></details>
          {repeated>1 && <p>The same action and camera are saved on {repeated} shots. Repetition may be intentional. Check whether they fit this scene; edits here affect only Scene {scene.scene_number}.</p>}
          <fieldset disabled={blocked}>
            <legend>Action for Scene {scene.scene_number}</legend>
            <p>{diagnosis.issues.actor||"The saved action passes the clarity check. Keep it unless you want to change this scene."}</p>
            {diagnosis.actionOptions.filter(text=>text!==values.actor).map(text=><button className="secondary-button" type="button" key={text} onClick={()=>choose("actor",text)}>Use saved action: {text}</button>)}
            <label>Scene action<textarea rows={3} maxLength={200} value={values.actor} onChange={event=>choose("actor",event.target.value)} placeholder="What does the existing subject visibly do in this shot?" /></label>
            {currentIssues?.actor && <p>{currentIssues.actor}</p>}
          </fieldset>
          <fieldset disabled={blocked}>
            <legend>Camera for Scene {scene.scene_number}</legend>
            <p>{diagnosis.issues.camera||"The saved camera direction passes the clarity check. Keep it unless you want to change this scene."}</p>
            {diagnosis.cameraOptions.filter(text=>text!==values.camera).map(text=><button className="secondary-button" type="button" key={text} onClick={()=>choose("camera",text)}>Use saved camera: {text}</button>)}
            <label>Scene camera direction<textarea rows={2} maxLength={140} value={values.camera} onChange={event=>choose("camera",event.target.value)} /></label>
            {diagnosis.issues.camera && CAMERA_OPTIONS.map(option=><button className="secondary-button" type="button" key={option.id} onClick={()=>choose("camera",option.text)}>{option.label}</button>)}
            {currentIssues?.camera && <p>{currentIssues.camera}</p>}
          </fieldset>
          <p role="status">{edits[scene.id] && changed.some(item=>item.id===scene.id)?currentIssues?.actor||currentIssues?.camera?"This scene still needs a clearer choice.":"This scene’s fix is ready to preview.":"No edit selected for this scene."}</p>
          <button className="secondary-button" type="button" disabled={blocked||visible.indexOf(scene)===0} onClick={()=>setSelected(visible[visible.indexOf(scene)-1].id)}>Previous scene</button>{" "}
          <button className="secondary-button" type="button" disabled={blocked||visible.indexOf(scene)===visible.length-1} onClick={()=>setSelected(visible[visible.indexOf(scene)+1].id)}>Next scene</button>
          {edits[scene.id] && <button className="secondary-button" type="button" disabled={blocked} onClick={()=>{setEdits(old=>{const next={...old};delete next[scene.id];return next;});setProposal(null);setReviewed(false);}}>Discard this scene’s edit</button>}
        </div>}
        <p>{ready.length} of {changed.length} edited shots ready for review. {affected.length} saved shots need attention. You can save reviewed fixes in groups and return to the rest.</p>
        <button className="secondary-button" type="button" disabled={blocked||!ready.length||ready.length!==changed.length} onClick={()=>{try{setProposal(proposeSceneRepairs(scenes,edits));setReviewed(false);setError("");}catch(reason){setError(reason instanceof Error?reason.message:"Review your scene choices.");}}}>Preview scene-specific fixes</button>
        {proposal && <div>
          <h3>Proposed draft fixes · {proposal.length} shots</h3>
          {proposal.map(item=><details key={item.scene_id}><summary>Scene {item.scene_number} · review changes</summary><p>Before action: {readSceneDirections(scenes.find(scene=>scene.id===item.scene_id)!).actor||"Missing or invalid"}</p><p>Before camera: {readSceneDirections(scenes.find(scene=>scene.id===item.scene_id)!).camera||"Missing or invalid"}</p><p>After action: {item.actor}</p><p>After camera: {item.camera}</p><p>Renderer request: {item.prompt}</p></details>)}
          <p>Only the listed draft directions change. Timing, story, appearance and continuity notes stay saved. No asset is approved and no render or batch is started.</p>
          <label><input type="checkbox" disabled={blocked} checked={reviewed} onChange={event=>setReviewed(event.target.checked)} /> I reviewed each proposed scene change.</label>
          <button className="primary-button" type="button" disabled={blocked||!reviewed} onClick={()=>void apply()}>{busy?"Saving draft fixes…":`Save fixes to ${proposal.length} draft shots`}</button>
        </div>}
      </>}
      {saved!==null && <p role="status">Saved fixes to {saved} draft shots. Review the plan, then lock it when ready. No render was started.</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
    </div>}
  </section>;
}
