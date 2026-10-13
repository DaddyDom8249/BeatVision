import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const file=new URL("../automation/evidence-report.mjs",import.meta.url);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"beatvision-evidence-"));
const base={target:"Preflight",rootCause:"Unresolved review",change:"No change",evidence:"GitHub thread 1",status:"BLOCKED",next:"Address review",headSha:"a".repeat(40)};
function run(data) {
  const filePath=path.join(temp,"report.json");fs.writeFileSync(filePath,JSON.stringify(data));
  return spawnSync(process.execPath,[file.pathname,filePath],{encoding:"utf8"});
}
test("renders factual report without project mutation",()=>{
  const r=run(base);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/DEPLOYMENT:\*\* NOT VERIFIED/);
});
test("refuses unsupported RESOLVED",()=>{
  const r=run({...base,status:"RESOLVED"});assert.notEqual(r.status,0);assert.match(r.stderr,/RESOLVED requires/);
});
test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
