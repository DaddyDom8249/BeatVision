import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/client";
export default function RevisionMediaPanel({projectId,planId,disabled,onRefresh,onCheck}:
 {projectId:string;planId:string;disabled:boolean;onRefresh:()=>Promise<void>;onCheck:(blocked:boolean)=>void}) {
 const [context,setContext]=useState<any>(null),[error,setError]=useState("");const [busy,setBusy]=useState(false);const lifetime=useRef(0),active=useRef(false);
 async function load(epoch=lifetime.current) {
  const result=await supabase.rpc("revision_media_context",{p_plan_id:planId});if(epoch!==lifetime.current)return;
  if(result.error || result.data?.plan_id!==planId || !Array.isArray(result.data?.candidates)||!Array.isArray(result.data?.history)) {
   setError("Could not check media from earlier revisions. Image batch generation is paused to avoid duplicate work.");onCheck(true);return;
  }
  setContext(result.data);setError("");onCheck(result.data.candidates.length>0);
 }
 useEffect(()=>{lifetime.current++;const epoch=lifetime.current;onCheck(true);setContext(null);void load(epoch).catch(()=>{if(epoch===lifetime.current)setError("Could not check earlier media. Reload before generating images.");});return()=>{lifetime.current++;};},[projectId,planId]);
 async function reuse() {
  if(active.current||busy||disabled||!context?.candidates?.length)return;
  active.current=true;setBusy(true);setError("");const epoch=lifetime.current;
  try {
   const result=await supabase.rpc("reuse_revision_images",{p_plan_id:planId,p_choices:context.candidates.map((x:any)=>({scene_id:x.scene_id,source_asset_id:x.source_asset_id}))});
   if(result.error)throw result.error;if(typeof result.data!=="number")throw Error("Reuse result could not be confirmed. Reload to check saved images.");
   if(epoch!==lifetime.current)return;await load(epoch);await onRefresh();
  } catch(reason){if(epoch===lifetime.current)setError(reason instanceof Error?reason.message:"Reuse could not be completed. Reload and review the source revision.");}
  finally{active.current=false;if(epoch===lifetime.current)setBusy(false);}
 }
 return <aside className="style-section" aria-label="Media from earlier revisions">
  {context?.candidates.length>0 && <>
   <h2>Your existing images are available</h2>
   <p>{context.candidates.length} approved images from the previous plan match this revision’s visual world, shot timing, appearance and continuity notes. Direction edits created new scenes; they did not delete those originals.</p>
   <p>Reuse the same stored files without image generation. Reused images keep their original generation history and need your review and approval for this revision. Earlier clips stay in their original revision; changed motion instructions need separate review.</p>
   <button className="primary-button" disabled={disabled||busy} onClick={()=>void reuse()}>{busy?"Linking existing images…":`Reuse ${context.candidates.length} existing images`}</button>
  </>}
  {context?.history.length>0 && <nav aria-label="Earlier footage"><strong>Previous images and motion</strong>{context.history.map((p:any)=><a key={p.id} className="secondary-button" href={`/projects/${projectId}/production?plan=${p.id}`}>Revision {p.revision_number} · {p.images} images · {p.clips} clips</a>)}</nav>}
  {error && <p role="alert">{error} <button className="secondary-button" disabled={busy} onClick={()=>void load()}>Check again</button></p>}
 </aside>;
}
