import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const unavailable="The world-generation provider is unavailable. No Visual World Report was created, and downstream stages remain locked.";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const auth=req.headers.get("Authorization"); if(!auth?.startsWith("Bearer "))return json({error:{code:"UNAUTHORIZED",message:"Authentication required."}},401);
 const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anon||!service)return json({error:{code:"SERVER_CONFIG",message:"Server configuration is incomplete."}},500);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}}), admin=createClient(url,service);
 const {data:u}=await userClient.auth.getUser(); if(!u.user)return json({error:{code:"UNAUTHORIZED",message:"Authentication required."}},401);
 const body=req.method==="GET"?{}:await req.json().catch(()=>({})); const projectId=body.projectId??new URL(req.url).searchParams.get("projectId");
 if(!projectId)return json({error:{code:"PROJECT_REQUIRED",message:"projectId is required."}},400);
 const {data:p}=await admin.from("projects").select("id,user_id,world_report_id,world_confirmed_at").eq("id",projectId).single();
 if(!p||p.user_id!==u.user.id)return json({error:{code:"NOT_FOUND",message:"Project not found."}},404);
 const {data:existing,error:readError}=await admin.from("world_reports").select("*").eq("project_id",projectId).maybeSingle();
 if(readError)return json({error:{code:"DB_READ_FAILED",message:readError.message}},500);
 if(req.method==="GET")return json({report:existing});
 if(req.method==="PATCH"){
  if(body.action!=="confirm")return json({error:{code:"INVALID_ACTION",message:"Only world confirmation is supported."}},400);
  if(!existing||existing.status!=="completed")return json({error:{code:"WORLD_NOT_READY",message:"A completed world report must exist before confirmation."}},409);
  if(existing.confirmed_at)return json({report:existing});
  const now=new Date().toISOString();
  const {data:confirmed,error}=await admin.from("world_reports").update({confirmed_at:now}).eq("id",existing.id).select("*").single();
  if(error)return json({error:{code:"CONFIRM_FAILED",message:error.message}},500);
  await admin.from("projects").update({world_report_id:existing.id,world_confirmed_at:now}).eq("id",projectId);
  return json({report:confirmed});
 }
 if(existing?.confirmed_at)return json({report:existing});
 const provider=Deno.env.get("BEATVISION_WORLD_PROVIDER");
 const payload=provider?{status:"unavailable",provider,error_code:"WORLD_PROVIDER_ADAPTER_UNIMPLEMENTED",error_message:"The configured provider has no Phase 2 adapter. No fake report was created."}:{status:"unavailable",error_code:"WORLD_PROVIDER_UNAVAILABLE",error_message:unavailable};
 const result=existing?await admin.from("world_reports").update(payload).eq("id",existing.id).select("*").single():await admin.from("world_reports").insert({project_id:projectId,...payload}).select("*").single();
 if(result.error)return json({error:{code:"DB_WRITE_FAILED",message:result.error.message}},500);
 return json({report:result.data},503);
});