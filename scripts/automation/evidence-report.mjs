import fs from "node:fs";
const input = process.argv[2];
if (!input) { console.error("Usage: node scripts/automation/evidence-report.mjs report.json [--append]"); process.exit(2); }
const data = JSON.parse(fs.readFileSync(input, "utf8"));
for (const field of ["target","rootCause","change","evidence","status","next","headSha"]) {
  if (typeof data[field] !== "string" || !data[field].trim()) throw new Error("Missing factual field: " + field);
}
if (!/^[a-f0-9]{40}$/i.test(data.headSha)) throw new Error("Exact 40-character commit SHA required.");
if (!new Set(["CONFIRMED","PROBABLE","NOT VERIFIED","BLOCKED","RESOLVED"]).has(data.status))
  throw new Error("Invalid evidence status.");
if (data.status === "RESOLVED" && !(data.originalRetest && data.regression && data.build && data.workflow))
  throw new Error("RESOLVED requires original retest, regression, build, and workflow evidence.");
const fields = [
  ["TARGET",data.target],["ROOT CAUSE",data.rootCause],["CHANGE",data.change],
  ["EVIDENCE",data.evidence],["STATUS",data.status],["NEXT",data.next],["EXACT HEAD",data.headSha],
  ["ORIGINAL RETEST",data.originalRetest || "NOT VERIFIED"],
  ["REGRESSION",data.regression || "NOT VERIFIED"],
  ["BUILD",data.build || "NOT VERIFIED"],["WORKFLOW",data.workflow || "NOT VERIFIED"],
  ["DEPLOYMENT",data.deployment || "NOT VERIFIED"]
];
const markdown="## "+new Date().toISOString()+" — "+data.target.replace(/[\r\n]+/g," ")+"\n\n"
  +fields.map(([k,v])=>"**"+k+":** "+String(v).replace(/\r/g,"")).join("\n\n")+"\n";
if (process.argv.includes("--append")) {
  const branch=process.env.GITHUB_HEAD_REF || process.env.BEATVISION_REPAIR_BRANCH;
  if (!branch || branch==="main" || branch==="master") throw new Error("Append requires a named non-main repair branch.");
  fs.appendFileSync(new URL("../../PROJECT_LOG.md",import.meta.url),"\n"+markdown);
} else process.stdout.write(markdown);
