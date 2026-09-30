import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { WorldReport } from "../types/world";

const endpoint = () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/beatvision-world`;

export function useWorld(projectId: string) {
  const [report,setReport]=useState<WorldReport|null>(null);
  const [loading,setLoading]=useState(true);
  const [generating,setGenerating]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const request=useCallback(async(method:"GET"|"POST"|"PATCH",body?:unknown)=>{
    const {data}=await supabase.auth.getSession();
    if(!data.session?.access_token) throw new Error("You must be signed in.");
    const res=await fetch(endpoint(),{method,headers:{Authorization:`Bearer ${data.session.access_token}`,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
    const payload=await res.json().catch(()=>({}));
    if(!res.ok){if(payload.report)setReport(payload.report);throw new Error(payload?.error?.message??"World request failed.");}
    return payload.report as WorldReport;
  },[]);

  const load=useCallback(async()=>{setLoading(true);setError(null);try{setReport(await request("GET",undefined));}catch(e){setError(e instanceof Error?e.message:"Unable to load world report.");}finally{setLoading(false);}},[request]);
  useEffect(()=>{void load();},[load]);

  const revealWorld=useCallback(async()=>{setGenerating(true);setError(null);try{setReport(await request("POST",{projectId}));}catch(e){setError(e instanceof Error?e.message:"Unable to reveal world.");}finally{setGenerating(false);}},[projectId,request]);
  const confirmWorld=useCallback(async()=>{setError(null);try{setReport(await request("PATCH",{projectId,action:"confirm"}));}catch(e){setError(e instanceof Error?e.message:"Unable to confirm world.");}},[projectId,request]);

  return {report,loading,generating,error,revealWorld,confirmWorld,reload:load};
}
