import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/db/supabase';
import { arenaAnimate, arenaAnimationJob } from '@/lib/beatvision/arena';
import { sceneTimeline } from '@/lib/beatvision/timeline';
import type { Project, SceneImage, SceneVideo, StoryboardScene } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Film, Loader2, CheckCircle2, XCircle, RefreshCw, Play, AlertTriangle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface Props { project: Project; initialImages: SceneImage[]; initialVideos: SceneVideo[]; initialScenes: StoryboardScene[]; onProjectUpdate: (updated: Partial<Project>) => void; }

export default function GenerateMotionSection({ project, initialImages, initialVideos, initialScenes, onProjectUpdate }: Props) {
  const [images,setImages]=useState<SceneImage[]>(initialImages), [videos,setVideos]=useState<SceneVideo[]>(initialVideos), [scenes,setScenes]=useState<StoryboardScene[]>(initialScenes);
  const [loading,setLoading]=useState(false), [running,setRunning]=useState(false), [busy,setBusy]=useState<Set<string>>(new Set());
  const pollers=useRef<Map<string,ReturnType<typeof setInterval>>>(new Map());

  const load=useCallback(async()=>{
    const [i,v,s]=await Promise.all([
      supabase.from('scene_images').select('*').eq('project_id',project.id).eq('approved',true).order('scene_number'),
      supabase.from('scene_videos').select('*').eq('project_id',project.id).order('scene_number'),
      supabase.from('storyboard_scenes').select('*').eq('project_id',project.id).order('scene_number'),
    ]);
    setImages((i.data||[]) as SceneImage[]); setVideos((v.data||[]) as SceneVideo[]); setScenes((s.data||[]) as StoryboardScene[]);
  },[project.id]);
  useEffect(()=>{setImages(initialImages);setVideos(initialVideos);setScenes(initialScenes);},[initialImages,initialVideos,initialScenes]);
  useEffect(()=>()=>{pollers.current.forEach(clearInterval); pollers.current.clear();},[]);

  const stop=(id:string)=>{const p=pollers.current.get(id); if(p) clearInterval(p); pollers.current.delete(id);};
  const persistClip=useCallback(async(videoId:string, sceneNumber:number, clip:any)=>{
    const url=clip?.video_url||clip?.url||null;
    if(!url) throw new Error(`Arena returned no video for scene ${sceneNumber}.`);
    const duration=Number(clip?.duration_seconds||clip?.requested_duration_seconds||5);
    await supabase.from('scene_videos').update({generation_status:'succeed',task_status_msg:null,video_url:url,duration:String(duration),updated_at:new Date().toISOString()}).eq('id',videoId);
    await supabase.from('motion_clips').upsert({project_id:project.id,scene_number:sceneNumber,clip_url:url,preview_url:url,duration,generation_status:'ready_for_review',status:'ready_for_review',approved:false,rejected:false,fallback_generated:clip?.generation_type==='CAMERA_MOTION_FALLBACK',pending:false,failed:false,needs_review:true,updated_after_approval:false,prompt_used:clip?.source||'BeatVision Arena motion',updated_at:new Date().toISOString()},{onConflict:'project_id,scene_number'}).select().maybeSingle();
  },[project.id]);

  const poll=useCallback(async(videoId:string, jobId:string)=>{
    try{
      const data=await arenaAnimationJob(jobId);
      const result=data?.result||data;
      if(Array.isArray(result?.clips)&&result.clips.length){
        for(const clip of result.clips){ const scene=Number(clip.scene); if(Number.isFinite(scene)) await persistClip(videoId,scene,clip); }
      }
      if(['completed','partial','failed'].includes(String(result?.status))){
        stop(videoId); setBusy(x=>{const n=new Set(x);n.delete(videoId);return n;}); await load();
        if(result.status==='completed') toast.success('Arena motion job completed. Review the generated clips.');
        else toast.error(`Arena motion job ${result.status}.`);
      }
    }catch(error){console.error(error);}
  },[load,persistClip]);

  const generateOne=async(img:SceneImage)=>{
    const existing=videos.find(v=>v.scene_image_id===img.id);
    let videoId=existing?.id||'';
    if(!videoId){const {data,error}=await supabase.from('scene_videos').insert({project_id:project.id,scene_image_id:img.id,scene_number:img.scene_number,scene_title:img.scene_title,generation_status:'submitted',prompt_used:'BeatVision Arena LTX motion'}).select().maybeSingle(); if(error||!data) throw error||new Error('Could not create motion record.'); videoId=data.id;}
    else await supabase.from('scene_videos').update({generation_status:'submitted',video_url:null,approved:false,rejected:false,updated_at:new Date().toISOString()}).eq('id',videoId);
    setBusy(x=>new Set(x).add(videoId));
    const storyboardScene=scenes.find(s=>s.scene_number===img.scene_number);const timeline=sceneTimeline(storyboardScene||img,5);
    const response=await arenaAnimate({project_id:project.id,storyboard:{songDuration:project.song_duration||0,scenes:[{scene:img.scene_number,scene_title:img.scene_title,startTime:timeline.startTime,endTime:timeline.endTime,duration_seconds:timeline.duration,visualEvent:img.prompt_summary||img.prompt_used||img.scene_title}]},images:{images:[{scene:img.scene_number,image_url:img.image_url,asset_id:img.id}]},world:{style:project.selected_style,storyboard_scene:storyboardScene||null}});
    const clips=response?.result?.clips;
    if(Array.isArray(clips)&&clips.length){await persistClip(videoId,img.scene_number,clips[0]); stop(videoId); setBusy(x=>{const n=new Set(x);n.delete(videoId);return n;}); return;}
    const jobId=response?.job_id||response?.result?.job_id||response?.result?.animation_job_id;
    if(!jobId) throw new Error('Arena accepted no motion job and returned no clip.');
    await supabase.from('scene_videos').update({task_id:jobId,task_status_msg:'BeatVision Arena job submitted',updated_at:new Date().toISOString()}).eq('id',videoId);
    stop(videoId); const interval=setInterval(()=>poll(videoId,jobId),7000); pollers.current.set(videoId,interval); await poll(videoId,jobId);
  };

  const generateAll=async()=>{
    if(running||!images.length)return; setRunning(true); await supabase.from('projects').update({status:'Generating Motion',updated_at:new Date().toISOString()}).eq('id',project.id); onProjectUpdate({status:'Generating Motion'});
    try{for(const img of images){const existing=videos.find(v=>v.scene_image_id===img.id); if(existing?.generation_status==='submitted'||existing?.generation_status==='processing')continue; await generateOne(img); await new Promise(r=>setTimeout(r,500));} await load();}
    catch(error){toast.error(error instanceof Error?error.message:'Arena motion generation failed.'); await supabase.from('projects').update({status:'Motion In Review'}).eq('id',project.id); onProjectUpdate({status:'Motion In Review'});}
    finally{setRunning(false);}
  };

  const approve=async(id:string)=>{await supabase.from('scene_videos').update({approved:true,rejected:false,updated_at:new Date().toISOString()}).eq('id',id); await load(); const count=videos.filter(v=>v.id===id||v.approved).length; if(count>=images.length){await supabase.from('projects').update({status:'Motion Approved',motion_approved:true}).eq('id',project.id);onProjectUpdate({status:'Motion Approved',motion_approved:true});}};
  const reject=async(id:string)=>{await supabase.from('scene_videos').update({approved:false,rejected:true,generation_status:'failed',task_status_msg:'Rejected for regeneration',updated_at:new Date().toISOString()}).eq('id',id); await load();};

  if(loading)return <div className="py-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin"/>Loading Arena motion pipeline…</div>;
  return <div className="space-y-5">
    <div className="flex items-center gap-3"><Film className="w-4 h-4 text-emerald-400"/><div><p className="text-xs font-mono uppercase tracking-widest text-muted-foreground/60">Arena Motion Pipeline</p><p className="text-xs text-muted-foreground/50">Pixazo LTX generative motion with durable Arena jobs and Shotstack-ready clips.</p></div></div>
    <Card><CardContent className="p-4 flex items-center justify-between gap-4"><div><p className="text-sm font-semibold">{videos.filter(v=>v.approved).length}/{images.length} approved</p><p className="text-xs text-muted-foreground">Arena is the primary motion provider. Other integrations remain optional.</p></div><Button onClick={generateAll} disabled={running||!images.length}>{running?<><Loader2 className="w-4 h-4 mr-2 animate-spin"/>Submitting…</>:<><Sparkles className="w-4 h-4 mr-2"/>Generate with Arena</>}</Button></CardContent></Card>
    <div className="space-y-3">{images.map(img=>{const v=videos.find(x=>x.scene_image_id===img.id);const busyNow=!!v&&busy.has(v.id);return <Card key={img.id}><CardContent className="p-4 flex items-center gap-3"><div className="w-24 aspect-video bg-muted rounded overflow-hidden shrink-0">{img.image_url&&<img src={img.image_url} className="w-full h-full object-cover"/>}</div><div className="flex-1 min-w-0"><p className="text-sm font-medium">Scene {img.scene_number} · {img.scene_title||'Untitled'}</p>{v&&<Badge>{busyNow?'Arena generating':v.generation_status}</Badge>}{v?.video_url&&<video src={v.video_url} controls className="mt-2 w-full max-w-xl rounded"/>}{v?.task_status_msg&&<p className="text-xs text-muted-foreground mt-1">{v.task_status_msg}</p>}</div><div className="flex flex-col gap-2">{v?.video_url&&!v.approved&&<Button size="sm" onClick={()=>approve(v.id)}><CheckCircle2 className="w-3 h-3 mr-1"/>Approve</Button>}{v?.video_url&&!v.rejected&&<Button size="sm" variant="ghost" onClick={()=>reject(v.id)}><XCircle className="w-3 h-3 mr-1"/>Reject</Button>}{(!v||v.generation_status==='failed')&&<Button size="sm" variant="outline" onClick={()=>generateOne(img)} disabled={busyNow}><Play className="w-3 h-3 mr-1"/>Generate</Button>}</div></CardContent></Card>})}</div>
  </div>;
}
