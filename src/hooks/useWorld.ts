import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { WorldReport } from "../types/world";
import { formatFailure, formatHttpFailure } from "../lib/errorDetails";

const endpoint = () => `${import.meta.env.VITE_SUPABASE_URL || "https://mdofsinyofqbeapzfygu.supabase.co"}/functions/v1/beatvision-world`;

const publishableKey = () => import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_x28OGL5xvygpE1ekq77Lqw_8Aa4Rioa";

export function useWorld(projectId: string) {
  const [report,setReport]=useState<WorldReport|null>(null);
  const [loading,setLoading]=useState(true);
  const [generating,setGenerating]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const request=useCallback(async(method:"GET"|"POST"|"PATCH",body?:unknown)=>{
    let {data}=await supabase.auth.getSession();
    if(!data.session?.access_token) {
      const refreshed=await supabase.auth.refreshSession();
      data=refreshed.data;
    }
    if(!data.session?.access_token) throw new Error("You must be signed in.");

    const url=method==="GET" ? `${endpoint()}?projectId=${encodeURIComponent(projectId)}` : endpoint();
    const headers: Record<string,string> = {apikey:publishableKey(),Authorization:`Bearer ${data.session.access_token}`,Accept:"application/json"};
    if(body!==undefined) headers["Content-Type"]="application/json";

    let res: Response;
    try {
      res=await fetch(url,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
    } catch (error) {
      throw new Error(formatFailure("World service network request", error, { method, projectId, endpoint: url }));
    }
    const text=await res.text();
    let payload:any={};
    try { payload=text?JSON.parse(text):{}; } catch { payload={}; }
    if(!res.ok){
      if(payload.report)setReport(payload.report);
      throw new Error(formatHttpFailure("World " + method + " request", res, text));
    }
    return payload.report as WorldReport;
  },[projectId]);

  const load=useCallback(async()=>{setLoading(true);setError(null);try{setReport(await request("GET"));}catch(e){setError(formatFailure("Load World report", e, { projectId }));}finally{setLoading(false);}},[request]);
  useEffect(()=>{void load();},[load]);

  const revealWorld=useCallback(async()=>{setGenerating(true);setError(null);try{setReport(await request("POST",{projectId}));}catch(e){setError(formatFailure("Reveal World", e, { projectId }));}finally{setGenerating(false);}},[projectId,request]);
  const saveWorld=useCallback(async(changes:Record<string,unknown>)=>{setError(null);try{setReport(await request("PATCH",{projectId,action:"save_edits",changes}));}catch(e){const message=formatFailure("Save World changes", e, { projectId, action:"save_edits" });setError(message);throw new Error(message);}},[projectId,request]);
  const confirmWorld=useCallback(async()=>{setError(null);try{setReport(await request("PATCH",{projectId,action:"confirm"}));}catch(e){setError(formatFailure("Confirm World", e, { projectId, action:"confirm" }));}},[projectId,request]);

  return {report,loading,generating,error,revealWorld,saveWorld,confirmWorld,reload:load};
}
