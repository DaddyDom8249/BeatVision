import { inspectMotionDirection } from "../../supabase/functions/beatvision-generation/shot-direction";
import type { VisualPlanScene } from "../types/visualPlan";

export const CAMERA_OPTIONS = [
  {id:"locked",label:"Keep the camera still",text:"Keep the camera fixed. No zoom."},
  {id:"closer",label:"Move gently closer",text:"Slow camera push-in without changing angle."},
  {id:"left",label:"Move gently to the left",text:"Slow camera pan to the left."},
] as const;
export type SceneDirections = {actor:string;camera:string};
export type ShotRepair = {scene_id:string;expected_movement_direction:string;expected_camera_direction:string;actor:string;camera:string;scene_number:number;prompt:string};

// Read only explicit saved action/camera fields. Never infer movement from mood,
// lyrics, location, a neighbouring shot, or an imagined subject in an image.
function decode(value:unknown,depth=0):unknown {
  if(depth>4) return null;
  if(typeof value!=="string") return value;
  const text=value.trim();
  if(!/^[\[{\"]/.test(text)) return text;
  try {return decode(JSON.parse(text),depth+1);} catch {
    try {return decode(JSON.parse(text.replace(/\\"/g,'"')),depth+1);} catch {return null;}
  }
}
function record(value:unknown):Record<string,unknown>|null {
  return value && typeof value==="object" && !Array.isArray(value)?value as Record<string,unknown>:null;
}
function literal(value:unknown):string {
  const parsed=decode(value);
  return typeof parsed==="string"?parsed:Array.isArray(parsed)&&parsed.length===1?literal(parsed[0]):"";
}
export function readSceneDirections(scene:VisualPlanScene):SceneDirections {
  const movement=decode(scene.movement_direction),fields=record(movement),camera=decode(scene.camera_direction);
  return {actor:literal(fields?fields.actor??fields.action:movement),camera:literal(fields?.camera||record(camera)?.camera_movement||camera)};
}
export function directionIssues({actor,camera}:SceneDirections):SceneDirections {
  const actionCheck=inspectMotionDirection({movement_direction:{actor,camera:"Keep the camera fixed."}});
  const cameraCheck=inspectMotionDirection({movement_direction:{actor:"The subject remains in the approved pose.",camera}});
  return {
    actor:actionCheck.issue || (actor.trim().length<8?"Describe one visible action in at least 8 characters.":""),
    camera:!camera.trim()?"Choose a camera direction for this shot.":cameraCheck.issue ||
      (/^(slow|subtle|gentle|minimal|cinematic|handheld|dynamic)[.!]?$/i.test(camera.trim())?"Say what the camera does, such as holding still or moving in a specific direction.":camera.trim().length<4?"Describe the camera direction more clearly.":""),
  };
}
export function diagnoseShot(scene:VisualPlanScene) {
  const directions=readSceneDirections(scene),issues=directionIssues(directions);
  const visual=record(decode(scene.visual_direction));
  const movement=decode(scene.movement_direction),fields=record(movement),savedCamera=decode(scene.camera_direction);
  const rawActor=decode(fields?fields.actor??fields.action:movement);
  const rawCamera=decode(fields?.camera||record(savedCamera)?.camera_movement||savedCamera);
  // Suggestions are verbatim choices from this shot's own explicit fields.
  // Alternatives are offered for the artist to select, never silently selected.
  function alternatives(value:unknown):string[] {
    if(Array.isArray(value))return value.map(literal).filter(Boolean);
    const text=literal(value);
    return /\b(?:not|never|avoid|without|don't)\b/i.test(text)?[text]:[text,...text.split(/\s+(?:or|alternatively|then)\s+/i)];
  }
  const actionOptions=[...alternatives(rawActor),literal(visual?.actor??visual?.action)]
    .map(text=>text.trim()).filter((text,index,all)=>text && all.indexOf(text)===index && !directionIssues({actor:text,camera:"Keep the camera fixed."}).actor);
  const cameraOptions=alternatives(rawCamera).map(text=>text.trim())
    .filter((text,index,all)=>text && all.indexOf(text)===index && !directionIssues({actor:"Hold the approved pose.",camera:text}).camera);
  return {directions,issues,actionOptions,cameraOptions,needsAttention:!!(issues.actor||issues.camera)};
}
export function proposeSceneRepairs(scenes:VisualPlanScene[],edits:Record<string,SceneDirections>):ShotRepair[] {
  const unknown=Object.keys(edits).filter(id=>!scenes.some(scene=>scene.id===id));
  if(unknown.length) throw new Error("The selected shot list changed. Reopen Beginner help.");
  return scenes.filter(scene=>Object.hasOwn(edits,scene.id)).flatMap(scene=>{
    const {actor,camera}=edits[scene.id],before=readSceneDirections(scene);
    if(actor===before.actor && camera===before.camera)return [];
    const issues=directionIssues({actor,camera});
    if(issues.actor||issues.camera)throw new Error(`Scene ${scene.scene_number}: ${issues.actor||issues.camera}`);
    const request=inspectMotionDirection({movement_direction:{actor,camera}});
    if(request.issue)throw new Error(`Scene ${scene.scene_number}: ${request.issue}`);
    return [{scene_id:scene.id,scene_number:scene.scene_number,expected_movement_direction:scene.movement_direction,
      expected_camera_direction:scene.camera_direction,actor,camera,prompt:request.prompt}];
  });
}
export async function saveShotRepairs(db:any,planId:string,repairs:ShotRepair[]) {
  if(!repairs.length || repairs.length>500 || new Set(repairs.map(x=>x.scene_id)).size!==repairs.length)
    throw new Error("The selected shot list changed. Reopen Beginner help.");
  for(const repair of repairs) {
    const issues=directionIssues(repair);
    if(issues.actor||issues.camera)throw new Error(`Scene ${repair.scene_number}: ${issues.actor||issues.camera}`);
  }
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
