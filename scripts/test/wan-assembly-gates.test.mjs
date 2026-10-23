import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync(new URL("../../src/pages/ProductionWorkspacePage.tsx",import.meta.url),"utf8");

test("WAN ZeroGPU new submissions are unavailable, but existing ticket polling stays",()=>{
 assert.match(page,/const wanPreviewEligibilityVerified = false;/);
 assert.match(page,/if \(!wanPreviewEligibilityVerified \|\| !scene/);
 assert.match(page,/Wan AI preview unavailable/);
 assert.match(page,/disabled=\{!wanPreviewEligibilityVerified \|\| busy/);
 assert.match(page,/Check Preview Status/);
});
test("final assembly requires plan-wide approved motion with exact coverage",()=>{
 assert.match(page,/const refreshAssemblyReadiness = useCallback/);
 assert.match(page,/\.from\("visual_plan_scenes"\)\.select\("id,status,scene_number,start_time,end_time"\)/);
 assert.match(page,/\.from\("motion_clip_assets"\)\.select\("id,scene_id,generation_job_id,status,approved,video_url"\)/);
 assert.match(page,/allScenes\.filter\(row => counts\.get\(row\.id\) !== 1\)/);
 assert.match(page,/approved\.length === allScenes\.length/);
 assert.match(page,/disabled=\{busy \|\| !assemblyReadiness\.ready\}/);
});
test("stale assembly approvals get rechecked before enqueue",()=>{
 assert.match(page,/if \(!job && type === "assembly"\)/);
 assert.match(page,/await refreshAssemblyReadiness\(plan\.id\)/);
 assert.match(page,/if \(!check\.ready\) throw new Error\(check\.message\)/);
});
