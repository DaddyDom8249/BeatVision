import type { WorldReport as WorldReportType } from "../../types/world";
function Section({title,value}:{title:string;value:unknown}){return <section><h3>{title}</h3><pre>{JSON.stringify(value,null,2)}</pre></section>;}
export default function WorldReport({report,onConfirm}:{report:WorldReportType;onConfirm:()=>void}){
 return <article><h1>Visual World Report</h1>
  <Section title="Mood" value={report.mood}/><Section title="Emotional Arc" value={report.emotional_arc}/>
  <Section title="Visual Language" value={report.visual_language}/><Section title="Cinematography" value={report.cinematography}/>
  <Section title="Environments" value={report.environments}/><Section title="Color / Lighting" value={report.color_lighting}/>
  <Section title="Motifs" value={report.motifs}/><Section title="Atmosphere" value={report.atmosphere}/>
  <Section title="Movement" value={report.movement}/><Section title="Continuity Rules" value={report.continuity_rules}/>
  <Section title="Things That Must Not Change" value={report.immutable_continuity}/>
  {report.confirmed_at?<p role="status">World confirmed.</p>:report.status==="completed"?<button onClick={onConfirm}>Yes, that's my world.</button>:null}
 </article>;
}