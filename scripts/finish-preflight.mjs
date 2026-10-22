#!/usr/bin/env node
/**
 * BeatVision completion preflight: source-only, zero provider calls, zero DB writes.
 * NOT an E2E test. A PASS means only that known source-level blockers were not
 * detected. Live auth/RLS/queue/media gates require separate evidence.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
function read(path) {
  const full = resolve(root, path);
  if (!existsSync(full)) {
    results.push({ gate: "FILE", status: "BLOCKED", evidence: "Missing: " + path });
    return "";
  }
  return readFileSync(full, "utf8");
}
function verify(gate, good, evidence) {
  results.push({
    gate,
    status: good ? "SOURCE_CHECK_PASS" : "BLOCKED",
    evidence,
  });
}
function unverifiable(gate, reason) {
  results.push({ gate, status: "NOT_VERIFIED", evidence: reason });
}
function segment(text, from, to) {
  const start = text.indexOf(from);
  if (start < 0) return "";
  const end = text.indexOf(to, start + from.length);
  return text.slice(start, end < 0 ? undefined : end);
}

const controller = read("supabase/functions/beatvision-generation/index.ts");
const style = read("src/hooks/useStyleStudio.ts");
const visualPlan = read("src/hooks/useVisualPlan.ts");
const assemblySql = read("supabase/migrations/20261006174104_enqueue_assembly_generation.sql");
const packageJson = read("package.json");

verify("SOURCE-00", Boolean(controller && style && visualPlan && assemblySql && packageJson),
  "Critical production source and SQL file paths exist.");

const polling = segment(controller, "async function poll(", "\nDeno.serve(");
const missingUpstream = polling.search(/if\s*\(!upstream\)\s*throw/);
const tryLocation = polling.indexOf("try {");
verify("SOURCE-01-JOB-POLL", Boolean(polling) && (missingUpstream < 0 || (tryLocation >= 0 && missingUpstream > tryLocation)),
  "The missing-upstream exception must not escape the failure handler or strand a processing job.");

const assetApproval = segment(style, "const approveAsset = useCallback(", "\n  return {");
verify("SOURCE-02-REFERENCE-APPROVAL", Boolean(assetApproval) &&
  !/styleBible\.status\s*===\s*[\"']approved[\"']/.test(assetApproval),
  "Character/environment reference approval must not be blocked merely because Style Bible is approved.");

verify("SOURCE-03-MOTION-PROVENANCE", Boolean(assemblySql) &&
  !/[\"']generation_type[\"']\s*,\s*[\"']GENERATIVE_VIDEO[\"']/.test(assemblySql),
  "Do not freeze all approved motion as GENERATIVE_VIDEO; use the actual persisted generation type.");

const objectWorldEnvironment = /firstText\(world\.environments\)/.test(visualPlan) &&
  /value\.filter\(\(v\): v is string/.test(visualPlan);
verify("SOURCE-04-WORLD-LOCATION", Boolean(visualPlan) && !objectWorldEnvironment,
  "Object-valued World environments must not silently fall through to atmosphere as scene location.");

try {
  const pkg = JSON.parse(packageJson);
  verify("SOURCE-05-TEST-SCRIPTS", Boolean(pkg.scripts?.test && pkg.scripts?.build && pkg.scripts?.["production-audit"]),
    "Existing regression tests, production audit, and TypeScript build must stay enabled.");
} catch (e) {
  verify("SOURCE-05-TEST-SCRIPTS", false, "Unable to parse package.json: " + String(e));
}

unverifiable("LIVE-01-QUEUE-RPC", "Production queue RPC owner permissions require a read-only production ACL inspection plus a genuine owner/non-owner execution test. Latest audit found authenticated INSERT denied.");
unverifiable("LIVE-02-STORAGE", "Legacy storage write/delete ownership policies need a current two-user authorization test; this script never changes storage or policies.");
unverifiable("LIVE-03-AUTHENTICATED-BROWSER", "A creator-authorized signed-in browser run through Ghast and Test bug is required; CI cannot simulate owner consent.");
unverifiable("LIVE-04-MEDIA-QUALITY", "Probe real images and full MP4/audio, provider type, signed URL refresh, correct 249.127s timeline. A URL or unit test is not enough.");
unverifiable("LIVE-05-CREATOR-APPROVAL", "Character, environment, image and motion approval is a separate real creator decision. CI must never approve.");
unverifiable("LIVE-06-MIGRATION-REPLAY", "Reconcile committed SQL with 66 recorded production migrations; prove cold replay in a disposable database.");

const failures = results.filter(x => x.status === "BLOCKED");
const report = {
  kind: "beatvision-source-only-completion-preflight",
  timestamp_utc: new Date().toISOString(),
  commit_sha: process.env.GITHUB_SHA ?? null,
  status: failures.length ? "BLOCKED" : "READY_FOR_LIVE_VALIDATION_NOT_FINISHED",
  blocked_source_gates: failures.length,
  live_gates_verified: 0,
  no_provider_calls: true,
  no_database_writes: true,
  gates: results,
};
const arg = process.argv.find(x => x.startsWith("--output="));
if (arg) writeFileSync(arg.slice("--output=".length), JSON.stringify(report, null, 2) + "\n");
console.log("BeatVision finish preflight: " + report.status);
for (const result of results) console.log("[" + result.status + "] " + result.gate + ": " + result.evidence);
if (failures.length) process.exitCode = 1;
