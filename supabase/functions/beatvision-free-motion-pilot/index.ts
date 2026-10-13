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
function b64(bytes:Uint8Array) {
  let result="";for(const byte of bytes)result+=String.fromCharCode(byte);
  return btoa(result).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromB64(value:string) {
  const padded=value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4);
  return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
}
async function signingKey(secret:string) {
  return crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
async function signedTicket(secret:string,projectId:string,sceneId:string,ownerId:string,eventId:string) {
  const data={p:projectId,s:sceneId,u:ownerId,e:eventId,x:Date.now()+20*60*1000};
  const payload=b64(new TextEncoder().encode(JSON.stringify(data)));
  const sig=await crypto.subtle.sign("HMAC",await signingKey(secret),new TextEncoder().encode(payload));
  return payload+"."+b64(new Uint8Array(sig));
}
async function verifiedTicket(secret:string,value:string,projectId:string,sceneId:string,ownerId:string) {
  const parts=String(value).split(".");
  if(parts.length!==2||parts[0].length>700||parts[1].length>120)throw Error("Invalid motion preview ticket.");
  const ok=await crypto.subtle.verify("HMAC",await signingKey(secret),fromB64(parts[1]),new TextEncoder().encode(parts[0]));
  if(!ok)throw Error("Invalid motion preview ticket.");
  let ticket:any;
  try{ticket=JSON.parse(new TextDecoder().decode(fromB64(parts[0])))}catch{throw Error("Invalid motion preview ticket.")}
  if(ticket.p!==projectId||ticket.s!==sceneId||ticket.u!==ownerId
    ||typeof ticket.x!=="number"||ticket.x<Date.now()
    ||!/^[a-zA-Z0-9_-]{8,130}$/.test(String(ticket.e||"")))throw Error("Expired or incorrect motion preview ticket.");
  return String(ticket.e);
}
async function gateway(req:Request,arenaURL:URL,secret:string,path:string,method:"GET"|"POST",payload?:unknown) {
  let response:Response;
  try{response=await fetch(new URL(path,arenaURL),{
    method,headers:{"Authorization":"Bearer "+secret,...(payload?{"Content-Type":"application/json"}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{}),
    signal:AbortSignal.timeout(method==="POST"?95000:20000)
  })}catch{return {ok:false,error:"Free video queue is unavailable or timed out.",status:503}}
  let data:any;
  try{data=await response.json()}catch{return {ok:false,error:"Free provider returned invalid response.",status:503}}
  if(!response.ok&&response.status!==202)return {ok:false,error:String(data?.error||data?.status||"Free provider unavailable.").slice(0,400),status:503};
  if(data?.ok!==true)return {ok:false,error:String(data?.error||"Free provider rejected request.").slice(0,400),status:503};
  return {ok:true,data,status:response.status};
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
  const action=String(body?.action||"start");
  if(action==="poll") {
    let eventId:string;
    try{eventId=await verifiedTicket(secret,String(body?.job_token||""),projectId,sceneId,identity.data.user.id)}
    catch(error){return respond(req,{ok:false,error:String(error instanceof Error?error.message:error)},403)}
    const response=await gateway(req,arenaURL,secret,"/v1/video/wan-zero/jobs/"+encodeURIComponent(eventId),"GET");
    if(!response.ok)return respond(req,{ok:false,status:"free_provider_unavailable",error:response.error},503);
    if(response.data?.status==="processing")
      return respond(req,{ok:true,status:"processing",job_token:body.job_token,scene_id:sceneId});
    const clip=response.data?.result?.clips?.[0];
    if(response.data?.status!=="completed"||!clip||clip.generation_type!=="GENERATIVE_VIDEO"||!safeURL(clip.video_url))
      return respond(req,{ok:false,error:"No verified AI-video result available."},502);
    return respond(req,{ok:true,status:"pilot_ready",scene_id:sceneId,video_url:clip.video_url,
      model:"wan2.2-zerogpu",provider:"hf-zerogpu",generation_type:"GENERATIVE_VIDEO",approved:false,
      note:"Short AI-motion preview only; does not approve or replace existing motion."});
  }
  if(action!=="start")return respond(req,{ok:false,error:"Only start or poll is supported."},422);

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
  const result=await gateway(req,arenaURL,secret,"/v1/video/wan-zero","POST",requestBody);
  if(!result.ok)return respond(req,{ok:false,status:"free_provider_unavailable",error:result.error},503);
  if(result.data?.status!=="submitted"||!/^[a-zA-Z0-9_-]{8,130}$/.test(String(result.data?.event_id||"")))
    return respond(req,{ok:false,error:"Free provider failed to confirm job submission."},502);
  const ticket=await signedTicket(secret,projectId,sceneId,identity.data.user.id,result.data.event_id);
  return respond(req,{ok:true,status:"submitted",scene_id:sceneId,
    job_token:ticket,model:"wan2.2-zerogpu",provider:"hf-zerogpu",
    preview_duration_seconds:pilotDuration,original_scene_duration_seconds:originalDuration,
    approved:false,note:"AI video request submitted once; check status without resubmitting."});

}
Deno.serve(async(req:Request)=>{
  try{return await handler(req);}
  catch {return respond(req,{ok:false,error:"Free motion pilot could not complete."},500);}
});
