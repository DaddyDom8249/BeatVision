import { useState } from 'react';
import { supabase } from '@/db/supabase';
import { arenaAssemble } from '@/lib/beatvision/arena';
import { sceneTimeline } from '@/lib/beatvision/timeline';
import type { Project, MotionClip, SceneImage, StoryboardScene, MotionSettings, FinalVideo, VideoRenderJob, SceneMotionPlan } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Loader2, Film, CheckCircle2, AlertCircle, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Props { project:Project; scenes:StoryboardScene[]; plans:SceneMotionPlan[]; clips:MotionClip[]; sceneImages:SceneImage[]; motionSettings:MotionSettings|null; finalVideo:FinalVideo|null; renderJob:VideoRenderJob|null; onFinalVideoUpdate:(v:FinalVideo)=>void; onRenderJobUpdate:(j:VideoRenderJob)=>void; onProjectUpdate:(p:Partial<Project>)=>void; }

export default function FinalVideoRenderSection({project,scenes,plans,clips,motionSettings,finalVideo,onFinalVideoUpdate,onRenderJobUpdate,onProjectUpdate}:Props){
  const [running,setRunning]=useState(false); const [error,setError]=useState<string|null>(null); const [url,setUrl]=useState(finalVideo?.video_url||null);
  const approvedScenes=scenes.filter(s=>s.approved);
  const renderable=clips.filter(c=>c.approved);
  const renderableSceneNumbers=new Set(renderable.map(c=>c.scene_number));
  const exactCoverage=approvedScenes.length===scenes.length &&
    renderable.length===approvedScenes.length &&
    approvedScenes.every(s=>renderableSceneNumbers.has(s.scene_number));
  const blocked=!motionSettings?.approved||!scenes.length||!exactCoverage;

  const render=async()=>{
    if(blocked){setError('Arena assembly requires approved motion settings, every storyboard scene approved, and exactly one approved motion clip for every storyboard scene.');return;}
    setRunning(true);setError(null);
    let job:VideoRenderJob|null=null;
    try{
      const {data:jd,error:je}=await supabase.from('video_render_jobs').insert({project_id:project.id,render_type:'final',status:'running',video_format:motionSettings?.video_format||'16:9 Landscape',video_quality:motionSettings?.video_quality||'HD 1080p',started_at:new Date().toISOString()}).select().maybeSingle();
      if(je||!jd)throw je||new Error('Unable to create render job.'); job=jd as VideoRenderJob;onRenderJobUpdate(job);
      const storyboard={songDuration:project.song_duration||0,scenes:scenes.map(s=>{const timeline=sceneTimeline(s,5);return{scene:s.scene_number,scene_title:s.scene_title,startTime:timeline.startTime,endTime:timeline.endTime,duration_seconds:timeline.duration,visualEvent:s.visual_description,cameraDirection:s.camera_direction,mood:s.mood,location:s.location,lyricMoment:s.lyric_moment};})};
      const motion={clips:renderable.map(c=>({scene:c.scene_number,asset_id:c.id,video_url:c.clip_url||c.preview_url,duration_seconds:c.duration||5,requested_duration_seconds:c.duration||5,provider:'pixazo',model:'ltx-video',generation_type:'GENERATIVE_VIDEO'}))};
      const result=await arenaAssemble({project_id:project.id,storyboard,motion,audio_url:project.song_file,song_duration_seconds:project.song_duration||null});
      const finalUrl=result?.result?.video_url||result?.result?.preview_url||null;
      if(!finalUrl)throw new Error('Arena/Shotstack completed without a final MP4 URL.');
      setUrl(finalUrl);
      const fvData={project_id:project.id,title:project.title,video_url:finalUrl,preview_video_url:finalUrl,audio_file:project.song_file,duration:Number(result?.result?.duration_seconds||project.song_duration||0),format:'mp4',quality:motionSettings?.video_quality||'HD 1080p',render_status:'complete' as const,downloadable:true};
      let fv:FinalVideo;if(finalVideo){const {data,error}=await supabase.from('final_videos').update({...fvData,updated_at:new Date().toISOString()}).eq('id',finalVideo.id).select().maybeSingle();if(error||!data)throw error||new Error('Could not update final video.');fv=data as FinalVideo;}else{const {data,error}=await supabase.from('final_videos').insert(fvData).select().maybeSingle();if(error||!data)throw error||new Error('Could not save final video.');fv=data as FinalVideo;}
      const {data:uj}=await supabase.from('video_render_jobs').update({status:'complete',output_url:finalUrl,completed_at:new Date().toISOString()}).eq('id',job.id).select().maybeSingle();if(uj)onRenderJobUpdate(uj as VideoRenderJob);
      await supabase.from('projects').update({status:'Final Video Rendered',updated_at:new Date().toISOString()}).eq('id',project.id);onProjectUpdate({status:'Final Video Rendered'});onFinalVideoUpdate(fv);toast.success('Arena assembled the final music video.');
    }catch(e){const msg=e instanceof Error?e.message:'Arena assembly failed.';setError(msg);if(job)await supabase.from('video_render_jobs').update({status:'failed',error_message:msg}).eq('id',job.id);await supabase.from('projects').update({status:'Render Failed'}).eq('id',project.id);onProjectUpdate({status:'Render Failed'});toast.error(msg);}finally{setRunning(false);}
  };

  return <div className="space-y-5"><div className="flex items-center gap-3"><Film className="w-4 h-4 text-emerald-400"/><div><p className="text-xs font-mono uppercase tracking-widest text-muted-foreground/60">Arena Final Assembly</p><p className="text-xs text-muted-foreground/50">Validated storyboard timeline → approved motion → Shotstack MP4.</p></div></div>{error&&<div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex gap-2 text-sm text-red-300"><AlertCircle className="w-4 h-4 shrink-0"/>{error}</div>}{url&&<div className="space-y-2"><video src={url} controls className="w-full rounded-xl bg-black"/><a href={url} target="_blank" rel="noreferrer" className="inline-flex"><Button size="sm"><Download className="w-3 h-3 mr-2"/>Open / Download MP4</Button></a></div>}<Button className="w-full h-11" onClick={render} disabled={running||blocked}>{running?<><Loader2 className="w-4 h-4 mr-2 animate-spin"/>Assembling with Shotstack…</>:url?<><RefreshCw className="w-4 h-4 mr-2"/>Re-assemble Final MP4</>:<><Film className="w-4 h-4 mr-2"/>Assemble Final MP4 with Arena</>}</Button>{blocked&&<p className="text-xs text-center text-muted-foreground/50">Approve every storyboard scene and exactly one motion clip per scene before final assembly.</p>}{!blocked&&!url&&<p className="text-xs text-center text-emerald-400/70"><CheckCircle2 className="inline w-3 h-3 mr-1"/>All Arena assembly prerequisites are present.</p>}</div>;
}
