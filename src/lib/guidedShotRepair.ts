import { inspectMotionDirection } from "../../supabase/functions/beatvision-generation/shot-direction";
import type { VisualPlanScene } from "../types/visualPlan";

export const ACTION_OPTIONS = [
  {id:"breathe",label:"Gentle breathing · person or animal",text:"The existing subject breathes gently while keeping the same pose."},
  {id:"turn",label:"Small head turn · person or animal",text:"The existing subject turns their head slightly to the left."},
  {id:"still",label:"Keep the existing subject still",text:"The existing subject stays still in the approved pose."},
] as const;
export const CAMERA_OPTIONS = [
  {id:"locked",label:"Keep the camera still",text:"Keep the camera fixed. No zoom."},
  {id:"closer",label:"Move gently closer",text:"Slow camera push-in without changing angle."},
  {id:"left",label:"Move gently to the left",text:"Slow camera pan to the left."},
] as const;
export type RepairChoices = {action:string;customAction:string;camera:string;customCamera:string};
export type ShotRepair = {scene_id:string;expected_movement_direction:string;expected_camera_direction:string;actor:string;camera:string;scene_number:number;prompt:string};
export function proposeShotRepairs(scenes:VisualPlanScene[], choices:RepairChoices): ShotRepair[] {
  const actor=choices.action==="custom"?choices.customAction.trim():ACTION_OPTIONS.find(x=>x.id===choices.action)?.text;
  const camera=choices.camera==="custom"?choices.customCamera.trim():CAMERA_OPTIONS.find(x=>x.id===choices.camera)?.text;
  if(!actor || !camera) throw new Error("Choose an action and camera movement, or write your own.");
  if(choices.action==="still" && choices.camera==="locked") throw new Error("Both subject and camera would be still. Choose movement for one of them before using motion generation.");
  const request=inspectMotionDirection({movement_direction:{actor,camera}});
  if(request.issue) throw new Error(request.issue);
  const affected=scenes.filter(scene=>inspectMotionDirection({...scene}).issue);
  if(!affected.length) throw new Error("These saved shots already pass direction checks. Use the individual editor for other changes.");
  return affected.map(scene=>({scene_id:scene.id,scene_number:scene.scene_number,
    expected_movement_direction:scene.movement_direction,expected_camera_direction:scene.camera_direction,
    actor,camera,prompt:request.prompt}));
}
export async function saveShotRepairs(db:any,planId:string,repairs:ShotRepair[]) {
  if(!repairs.length || repairs.length>500 || new Set(repairs.map(x=>x.scene_id)).size!==repairs.length)
    throw new Error("The selected shot list changed. Reopen Beginner help.");
  const response=await db.rpc("save_guided_shot_directions",{p_plan_id:planId,p_repairs:repairs.map(({scene_id,expected_movement_direction,expected_camera_direction,actor,camera})=>({scene_id,expected_movement_direction,expected_camera_direction,actor,camera}))});
  if(response.error) {
    const message=String(response.error.message||"");
    if(message.includes("GUIDED_REPAIR_STALE")) throw new Error("A shot changed in another session. Reload and preview the fixes again. Nothing was saved.");
    if(message.includes("GUIDED_REPAIR_DRAFT_REQUIRED")) throw new Error("Create an editable revision first. Your locked plan is protected.");
    throw new Error(message||"Could not save the proposed fixes. Nothing was partially saved.");
  }
  if(response.data!==repairs.length) throw new Error("Save result could not be confirmed. Reload the plan before trying again.");
  return response.data as number;
}
