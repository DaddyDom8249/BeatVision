import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ORIGINS = new Set(["https://beat-vision-theta.vercel.app","https://beat-vision-beat-vision.vercel.app"]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const VIDEO_HOST = "zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space";
const MAX_SECONDS = 3;

function headers(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {"Content-Type":"application/json","Cache-Control":"no-store",
    "Vary":"Origin","Access-Control-Allow-Methods":"POST, OPTIONS",
    "Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type",
    ...(ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{})};
}
function respond(req:Request,data:unknown,status=200) {
  return new Response(JSON.stringify(data),{status,headers:headers(req)});
}
function env(name:string) {return String(Deno.env.get(name)||"").trim();}
function safeURL(value:unknown) {
  try {const v=new URL(String(value));return v.protocol==="https:"&&v.hostname===VIDEO_HOST
    &&v.pathname.includes("/file=");}
  catch {return false;}
}
async function handler(req:Request) {
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(req)});
  if(req.method!=="POST")return respond(req,{ok:false,error:"POST required."},405);
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer "))return respond(req,{ok:false,error:"Authenticated creator required."},401);
  const url=env("SUPABASE_URL"),anon=env("SUPABASE_ANON_KEY")||env("SUPABASE_PUBLISHABLE_KEY");
  const service=env("SUPABASE_SERVICE_ROLE_KEY"),arena=env("ARENA_GATEWAY_URL"),secret=env("ARENA_GATEWAY_TOKEN");
  if(!url||!anon||!service||!arena||!secret)return respond(req,{ok:false,error:"Free motion bridge unavailable: missing server configuration."},503);
  let arenaURL:URL;
  try {arenaURL=new URL(arena);}catch{return respond(req,{ok:false,error:"Invalid Arena configuration."},503);}
  if(arenaURL.protocol!=="https:"||!arenaURL.hostname.endsWith(".workers.dev"))
    return respond(req,{ok:false,error:"Arena endpoint is not an approved Worker host."},503);
  let body:any;
  try {body=await req.json();}catch{return respond(req,{ok:false,error:"Invalid JSON request."},400);}
  const projectId=String(body?.project_id||""),sceneId=String(body?.scene_id||"");
  if(!UUID.test(projectId)||!UUID.test(sceneId))return respond(req,{ok:false,error:"Invalid project or scene identifier."},400);
  const access=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const identity=await access.auth.getUser(auth.slice(7));
  if(identity.error||!identity.data.user?.id)return respond(req,{ok:false,error:"Authenticated creator required."},401);
  // Service role is strictly server-side; every query below is explicitly owner/project-scoped.
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const project=await db.from("projects").select("id,owner_id").eq("id",projectId).eq("owner_id",identity.data.user.id).maybeSingle();
  if(project.error||!project.data)return respond(req,{ok:false,error:"Project unavailable for authenticated creator."},403);
  const scene=await db.from("visual_plan_scenes")
    .select("id,project_id,visual_plan_id,scene_number,start_time,end_time,visual_direction,camera_direction,movement_direction,status")
    .eq("project_id",projectId).eq("id",sceneId).eq("status","approved").maybeSingle();
  if(scene.error||!scene.data)return respond(req,{ok:false,error:"An approved storyboard scene is required."},409);
  const asset=await db.from("scene_image_assets")
    .select("id,project_id,visual_plan_id,scene_id,storage_path,approved,status")
    .eq("project_id",projectId).eq("visual_plan_id",scene.data.visual_plan_id)
    .eq("scene_id",sceneId).eq("approved",true).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(asset.error||!asset.data)return respond(req,{ok:false,error:"An approved real source image is required."},409);
  const storagePath=String(asset.data.storage_path||"");
  if(!storagePath.startsWith(projectId+"/scene-images/")||storagePath.includes(".."))
    return respond(req,{ok:false,error:"Approved image provenance is invalid."},409);
  const signed=await db.storage.from("visual-assets").createSignedUrl(storagePath,900);
  if(signed.error||!signed.data?.signedUrl)return respond(req,{ok:false,error:"Approved image could not be signed."},503);
  const originalDuration=Number(scene.data.end_time)-Number(scene.data.start_time);
  if(!(originalDuration>0))return respond(req,{ok:false,error:"Invalid scene timeline."},422);
  const pilotDuration=Math.min(MAX_SECONDS,originalDuration);
  // Explicitly render only a short *preview*. Never replace approved scene media,
  // write DB rows, or claim coverage of the full approved scene.
  const requestBody={contract_version:"1.1",operation:"animate",
    payload:{generation:{requested_model:"wan2.2-zerogpu"},
      storyboard:{scenes:[{scene:scene.data.scene_number,scene_number:scene.data.scene_number,
        startTime:0,endTime:pilotDuration,visual_direction:scene.data.visual_direction,
        movement_direction:scene.data.movement_direction,camera_direction:scene.data.camera_direction}]},
      images:{images:[{image_url:signed.data.signedUrl,approved:true,scene_id:sceneId,asset_id:asset.data.id}]}}};
  let response:Response;
  try {response=await fetch(new URL("/v1/video/wan-zero",arenaURL),{
    method:"POST",headers:{"Authorization":"Bearer "+secret,"Content-Type":"application/json"},
    body:JSON.stringify(requestBody),signal:AbortSignal.timeout(125000)});
  }catch{return respond(req,{ok:false,error:"Free video queue is unavailable or timed out; no paid fallback was used."},503);}
  let data:any;
  try {data=await response.json();}catch{return respond(req,{ok:false,error:"Free video provider returned invalid output."},503);}
  if(!response.ok||data?.ok!==true)return respond(req,{ok:false,status:"free_provider_unavailable",
    error:String(data?.error||data?.status||"Free ZeroGPU request refused.").slice(0,400)},503);
  const clip=data?.result?.clips?.[0];
  if(!clip||!safeURL(clip.video_url)||clip.generation_type!=="GENERATIVE_VIDEO")
    return respond(req,{ok:false,error:"A verified AI motion MP4 URL was not returned."},502);
  return respond(req,{ok:true,status:"pilot_ready",scene_id:sceneId,
    video_url:clip.video_url,source_image_id:asset.data.id,
    model:"wan2.2-zerogpu",provider:"hf-zerogpu",
    preview_duration_seconds:pilotDuration,original_scene_duration_seconds:originalDuration,
    generation_type:"GENERATIVE_VIDEO",approved:false,
    note:"Temporary free-quota AI motion preview only; never replaces approved motion or final assembly."});
}
Deno.serve(async(req:Request)=>{
  try{return await handler(req);}
  catch {return respond(req,{ok:false,error:"Free motion pilot could not complete."},500);}
});
