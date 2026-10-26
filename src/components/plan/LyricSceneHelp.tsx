import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/client";
import { inspectMotionDirection } from "../../../supabase/functions/beatvision-generation/shot-direction";
import type { VisualPlanScene } from "../../types/visualPlan";

const motionAction = (p: {action:string;emotion:string}) => `${p.action} Feeling: ${p.emotion}.`;

type Proposal = {mode:string;lyric_excerpt:string;action:string;objects:string[];emotion:string;visual_direction:string;camera:string;meaning:string;uncertainty:string};
export default function LyricSceneHelp({scene,lyrics,disabled,onApply}:{scene:VisualPlanScene;lyrics:string;disabled:boolean;onApply:(changes:Partial<VisualPlanScene>)=>void}) {
  const [open,setOpen]=useState(false),[mode,setMode]=useState("literal"),[excerpt,setExcerpt]=useState("");
  const [assigned,setAssigned]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [result,setResult]=useState<{scene_proposal:Proposal;timing:{source:string;precision:string}}|null>(null);
  const epoch=useRef(0),active=useRef(false);
  useEffect(()=>{epoch.current++;setResult(null);setError("");setExcerpt("");setAssigned(false);return()=>{epoch.current++;};},[scene.id,scene.updated_at]);
  function reset(){epoch.current++;setResult(null);setError("");}
  async function propose(){
    if(active.current||disabled||scene.status!=="draft")return;
    const version=epoch.current;active.current=true;setBusy(true);setError("");setResult(null);
    try {
      const {data,error:failure}=await supabase.functions.invoke("beatvision-ai-director",{body:{projectId:scene.project_id,
        action:"propose_scene",scene_id:scene.id,mode,lyric_excerpt:excerpt,confirm_assignment:assigned}});
      if(epoch.current!==version)return;
      if(failure||data?.error){
        let message=data?.error?.message;
        if(!message && failure?.context instanceof Response){try{message=(await failure.context.json()).error?.message;}catch{/* keep safe fallback */}}
        throw new Error(message||failure?.message||"The lyric proposal is unavailable. Your saved scene is unchanged.");
      }
      const p=data?.scene_proposal;
      if(data?.scene_id!==scene.id||data?.expected_updated_at!==scene.updated_at||!p||p.mode!==mode||
        typeof p.action!=="string"||typeof p.camera!=="string"||!Array.isArray(p.objects)||
        !p.objects.every((item:unknown)=>typeof item==="string")||
        [p.emotion,p.visual_direction,p.lyric_excerpt,p.meaning,p.uncertainty].some(item=>typeof item!=="string"||!item.trim())||
        inspectMotionDirection({movement_direction:{actor:motionAction(p),camera:p.camera}}).issue)
        throw new Error("The proposal is stale or unclear. Reload or choose a clearer scene action; nothing was saved.");
      setResult(data);
    }catch(reason){if(epoch.current===version)setError(reason instanceof Error?reason.message:"Unable to propose this scene.");}
    finally{active.current=false;setBusy(false);}
  }
  const p=result?.scene_proposal;
  return <aside aria-label={`Scene ${scene.scene_number} lyric direction`}>
    <button type="button" className="secondary-button" onClick={()=>setOpen(!open)} aria-expanded={open}>Match this scene to its lyrics</button>
    {open && <div>
      <p>Show what this lyric describes and how it feels. AI suggests one scene for review. Save any current edits first. Locked plans need an editable revision.</p>
      <fieldset disabled={disabled||busy||scene.status!=="draft"}>
        <label>Interpretation<select value={mode} onChange={e=>{reset();setMode(e.target.value);}}>
          <option value="literal">Literal · show the described event</option><option value="symbolic">Symbolic · express its meaning</option><option value="mixed">A blend of both</option>
        </select></label>
        <details><summary>Saved lyrics / transcript</summary><p style={{whiteSpace:"pre-wrap"}}>{lyrics||"No saved lyrics or transcript available."}</p></details>
        <label>Exact lyric excerpt (optional when transcript timing is available)<textarea rows={2} maxLength={1200} value={excerpt} onChange={e=>{reset();setExcerpt(e.target.value);setAssigned(false);}} /></label>
        {excerpt.trim() && <label><input type="checkbox" checked={assigned} onChange={e=>{reset();setAssigned(e.target.checked);}} /> I place these exact saved words in this scene. Their precise timing is unverified.</label>}
        <button type="button" className="secondary-button" disabled={!!excerpt.trim()&&!assigned} onClick={()=>void propose()}>{busy?"Reading this lyric…":"Propose lyric-specific scene"}</button>
      </fieldset>
      {p && <div>
        <p>Lyric: {p.lyric_excerpt}</p><p>Meaning: {p.meaning}</p><p>Must show: {p.objects.join(", ")}</p>
        <p>Visible action: {p.action}</p><p>Emotion: {p.emotion}</p><p>Image direction: {p.visual_direction}</p><p>Camera: {p.camera}</p>
        <p>Timing: {result.timing.source === "artist_assigned"?"Artist-assigned placement":"Machine transcript timing estimate"}. {result.timing.precision}</p>
        <p>Review: {p.uncertainty}</p>
        <p>Check the image includes the required objects before motion. Changed visuals need a new image or a compatible reviewed source. Generated output still needs your review.</p>
        <button type="button" className="secondary-button" disabled={disabled||busy||scene.status!=="draft"} onClick={()=>{
          onApply({lyric_moment:p.lyric_excerpt,mood:p.emotion,
            visual_direction:`${p.visual_direction}\nMust show: ${p.objects.join(", ")}.\nEmotion: ${p.emotion}.\nTreatment: ${p.mode}. Meaning: ${p.meaning}\nLyric: ${p.lyric_excerpt}\nTiming: ${result.timing.source}; exact synchronization unverified.\nReview: ${p.uncertainty}`,
            movement_direction:JSON.stringify({actor:motionAction(p),camera:p.camera}),camera_direction:p.camera});
          setResult(null);
        }}>Use proposal in editable fields</button>
        <p>Then review and Save Scene Direction. No render or approval starts here.</p>
      </div>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </aside>;
}
