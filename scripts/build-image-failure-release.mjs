// Deterministic narrow patch of the archived exact v74 runtime. Never deploy the
// divergent feature controller or rewrite historical snapshots.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const baseline=await readFile(new URL('docs/releases/2026-10-27/neurons/beatvision-generation/live-v73-budget-guard.ts',root),'utf8');
const feature=await readFile(new URL('supabase/functions/beatvision-generation/index.ts',root),'utf8');
let candidate=baseline;
function replaceOnce(before,after){
 if(candidate.split(before).length!==2)throw Error('Release anchor changed');
 candidate=candidate.replace(before,after);
}
const helper=feature.slice(feature.indexOf('// Arena currently wraps Workers AI errors'),feature.indexOf('async function setFailed('));
if(!helper.startsWith('// Arena currently')||!helper.includes('function sceneImageFailure('))throw Error('Missing helper');
replaceOnce('async function setFailed(',helper+'async function setFailed(');
const before=baseline.slice(baseline.indexOf('    error: { code:'),baseline.indexOf('  }).eq("id", id)'));
const after=feature.slice(feature.indexOf('    error: { code:'),feature.indexOf('  }).eq("id", id)'));
replaceOnce(before,after);
const failure='      await setFailed(db, job.id, String(result.data?.error?.message || result.data?.error || "Arena rejected generation."), compactArenaResponse(result.data, job.job_type));';
const start=feature.indexOf('      if (job.job_type === "scene_image") {\n        const failure = sceneImageFailure');
const end=feature.indexOf('\n    } else if (state === "completed")',start);
if(start<0||end<start)throw Error('Missing dispatch block');
replaceOnce(failure,feature.slice(start,end));
const dir=new URL('docs/releases/2026-10-27/image-failures/',root);
await mkdir(dir,{recursive:true});
await writeFile(new URL('live-v74-image-failures.ts',dir),candidate);
console.log('Built exact-v74 image-failure candidate; no deployment or inference.');
