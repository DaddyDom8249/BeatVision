import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { WorldReport } from "../types/world";

const endpoint = () => `${import.meta.env.VITE_SUPABASE_URL || "https://mdofsinyofqbeapzfygu.supabase.co"}/functions/v1/beatvision-world`;

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
    const headers: Record<string,string> = {Authorization:`Bearer ${data.session.access_token}`,Accept:"application/json"};
    if(body!==undefined) headers["Content-Type"]="application/json";

    let res: Response;
    try {
      res=await fetch(url,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
    } catch {
      throw new Error("Cannot reach World service. Check your connection and try again.");
    }
    const text=await res.text();
    let payload:any={};
    try { payload=text?JSON.parse(text):{}; } catch { payload={}; }
    if(!res.ok){
      if(payload.report)setReport(payload.report);
      throw new Error(payload?.error?.message || payload?.report?.error_message || `World request failed (${res.status}).`);
    }
    return payload.report as WorldReport;
  },[projectId]);

  const load=useCallback(async()=>{setLoading(true);setError(null);try{setReport(await request("GET"));}catch(e){setError(e instanceof Error?e.message:"Unable to load world report.");}finally{setLoading(false);}},[request]);
  useEffect(()=>{void load();},[load]);

  const revealWorld=useCallback(async()=>{setGenerating(true);setError(null);try{setReport(await request("POST",{projectId}));}catch(e){setError(e instanceof Error?e.message:"Unable to reveal world.");}finally{setGenerating(false);}},[projectId,request]);
  const saveWorld=useCallback(async(changes:Record<string,unknown>)=>{setError(null);try{setReport(await request("PATCH",{projectId,action:"save_edits",changes}));}catch(e){const message=e instanceof Error?e.message:"Unable to save world changes.";setError(message);throw new Error(message);}},[projectId,request]);
  const confirmWorld=useCallback(async()=>{setError(null);try{setReport(await request("PATCH",{projectId,action:"confirm"}));}catch(e){setError(e instanceof Error?e.message:"Unable to confirm world.");}},[projectId,request]);

  return {report,loading,generating,error,revealWorld,saveWorld,confirmWorld,reload:load};
}
