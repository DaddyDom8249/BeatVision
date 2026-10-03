import WorldReport from "../components/world/WorldReport";
import { useWorld } from "../hooks/useWorld";
import { useSong } from "../hooks/useSong";

export default function WorldPage({projectId,onNavigate}:{projectId:string;onNavigate:(next:string)=>void}){
 const {report,loading,generating,error,revealWorld,saveWorld,createRevision,confirmWorld}=useWorld(projectId);
 const {song,loading:songLoading,error:songError}=useSong(projectId);

 if(loading||songLoading)return <main><p>Loading world…</p></main>;
 if(!song?.audio_path)return <main><h1>Reveal World</h1><p>Save an audio track before revealing the world.</p></main>;
 if(song.analysis_status!=="completed" || song.analysis?.analysis_method!=="browser_audio_decode")return <main><h1>Analyze the song first</h1><p>BeatVision needs local musical analysis before World Reveal. Return to Song and run Analyze music.</p>{songError&&<p role="alert">{songError}</p>}</main>;
 if(!report)return <main><h1>Reveal World</h1><p>Reveal the song's durable visual world.</p><button disabled={generating} onClick={()=>void revealWorld()}>{generating?"Revealing…":"Reveal World"}</button>{error&&<p role="alert">{error}</p>}</main>;
 if(report.status==="unavailable")return <main><h1>World Generation Unavailable</h1><p role="alert">{report.error_message??"The world-generation provider is unavailable."}</p><p>No fake report was created. Downstream stages remain locked.</p></main>;
 if(report.status==="failed")return <main><h1>World Reveal Failed</h1><p role="alert">{report.error_message??"The world report could not be generated."}</p></main>;
 return <main>{error&&<p role="alert">{error}</p>}<WorldReport report={report} onSave={saveWorld} onCreateRevision={createRevision} onConfirm={()=>void confirmWorld()} onContinue={()=>onNavigate(`/projects/${projectId}/style`)}/></main>;
}