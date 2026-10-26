import { inspectMotionDirection } from "../../supabase/functions/beatvision-generation/shot-direction";
import type { VisualPlanScene } from "../types/visualPlan";
export type PlanProposal = {scene_id:string;scene_number:number;expected_updated_at:string;interpretation_id:string;
  scene_proposal:{mode:string;lyric_excerpt:string;action:string;objects:string[];emotion:string;visual_direction:string;camera:string;meaning:string;uncertainty:string};
  timing:{source:string;precision:string}};
export const proposalAction=(p:PlanProposal["scene_proposal"])=>`${p.action} Feeling: ${p.emotion}.`;
export function proposalFields(item:PlanProposal) {
  const p=item.scene_proposal;
  return {lyric_moment:p.lyric_excerpt,mood:p.emotion,camera_direction:p.camera,actor:proposalAction(p),
    visual_direction:`${p.visual_direction}\nMust show: ${p.objects.join(", ")}.\nEmotion: ${p.emotion}.\nTreatment: ${p.mode}. Meaning: ${p.meaning}\nLyric: ${p.lyric_excerpt}\nTiming: ${item.timing.source}; exact synchronization unverified.\nReview: ${p.uncertainty}`};
}
async function errorMessage(result:any) {
  if(result.data?.error?.message)return String(result.data.error.message);
  if(result.error?.context instanceof Response){try{return (await result.error.context.json()).error?.message || result.error.message;}catch{/* safe fallback */}}
  return result.error?.message || "The plan could not be prepared. Your saved work is unchanged.";
}
export async function preparePlanDirections(client:any,planId:string,scenes:VisualPlanScene[],mode:string,previous:PlanProposal[],
  onProgress:(proposals:PlanProposal[])=>void,stopped:()=>boolean=()=>false) {
  if(!scenes.length||scenes.length>500||new Set(scenes.map(s=>s.id)).size!==scenes.length||
    scenes.some(s=>s.status!=="draft"||s.visual_plan_id!==planId))throw new Error("Open an editable plan before preparing directions.");
  let ready=previous.filter(p=>p.scene_proposal.mode===mode&&scenes.some(s=>s.id===p.scene_id&&s.updated_at===p.expected_updated_at));
  for(const batch of Array.from({length:Math.ceil(scenes.length/8)},(_,index)=>scenes.slice(index*8,index*8+8))) {
    if(stopped())return ready;
    const missing=batch.filter(s=>!ready.some(p=>p.scene_id===s.id));if(!missing.length)continue;
    const response=await client.functions.invoke("beatvision-ai-director",{body:{action:"propose_plan_scenes",projectId:scenes[0].project_id,
      plan_id:planId,scene_ids:missing.map(s=>s.id),mode,previous_scene:ready.length?{scene_id:ready.at(-1)!.scene_id,...ready.at(-1)!.scene_proposal}:null}});
    if(stopped())return ready;
    if(response.error||response.data?.error)throw new Error(await errorMessage(response));
    const data=response.data,items=data?.scene_proposals;
    if(data?.plan_id!==planId||!data.interpretation_id||!Array.isArray(items)||items.length!==missing.length||new Set(items.map((p:any)=>p?.scene_id)).size!==missing.length)
      throw new Error("The proposal did not cover the requested scenes. Your saved plan is unchanged.");
    const validated:PlanProposal[]=missing.map(scene=>{
      const item=items.find((p:any)=>p?.scene_id===scene.id),p=item?.scene_proposal;
      if(!p||p.mode!==mode||item.expected_updated_at!==scene.updated_at||typeof p.lyric_excerpt!=="string"||
        [p.action,p.emotion,p.visual_direction,p.camera,p.meaning,p.uncertainty].some(v=>typeof v!=="string"||!v.trim())||
        !Array.isArray(p.objects)||!p.objects.length||p.objects.some((v:unknown)=>typeof v!=="string"||!v.trim())||
        !item.timing?.source||!item.timing?.precision||
        inspectMotionDirection({movement_direction:{actor:proposalAction(p),camera:p.camera}}).issue)
        throw new Error(`Scene ${scene.scene_number} returned unclear or stale direction. Nothing was saved.`);
      if(ready.some(old=>old.interpretation_id!==data.interpretation_id))throw new Error("The song interpretation changed. Prepare the plan again before saving.");
      return {...item,scene_number:scene.scene_number,interpretation_id:data.interpretation_id};
    });
    ready=[...ready,...validated].sort((a,b)=>a.scene_number-b.scene_number);onProgress(ready);
  }
  return ready;
}
export async function savePlanDirections(client:any,planId:string,scenes:VisualPlanScene[],proposals:PlanProposal[]) {
  if(proposals.length!==scenes.length||!proposals.length||new Set(proposals.map(p=>p.scene_id)).size!==scenes.length||
    proposals.some(p=>!scenes.some(s=>s.id===p.scene_id&&s.updated_at===p.expected_updated_at&&s.status==="draft")||p.interpretation_id!==proposals[0].interpretation_id))
    throw new Error("The plan changed. Prepare and review all scenes again before saving.");
  const result=await client.rpc("save_automatic_scene_directions",{p_plan_id:planId,p_interpretation_id:proposals[0].interpretation_id,
    p_repairs:proposals.map(item=>({scene_id:item.scene_id,expected_updated_at:item.expected_updated_at,...proposalFields(item)}))});
  if(result.error){const message=String(result.error.message||"");throw new Error(message.includes("STALE")?"The plan or interpretation changed. Reload before saving; nothing was partially saved.":message.includes("DRAFT")?"Create an editable copy first. Your locked plan is protected.":message||"Unable to save this plan.");}
  if(result.data!==proposals.length)throw new Error("Save could not be confirmed. Reload before trying again.");
  return result.data as number;
}
