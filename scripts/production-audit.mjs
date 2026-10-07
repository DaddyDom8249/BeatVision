import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`MISSING ${relative}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function forbid(relative, patterns) {
  const content = read(relative);
  for (const [label, pattern] of patterns) {
    if (pattern.test(content)) failures.push(`FORBIDDEN ${relative}: ${label}`);
  }
}

function requireText(relative, patterns) {
  const content = read(relative);
  for (const [label, pattern] of patterns) {
    if (!pattern.test(content)) failures.push(`MISSING ${relative}: ${label}`);
  }
}

requireText("src/app/App.tsx", [["production workspace route", /ProductionWorkspacePage/]]);
forbid("src/app/App.tsx", [["fake Studio route", /studioMatch|StudioPage/]]);

for (const file of [
  "src/hooks/useStoryboard.ts",
  "src/hooks/useScenes.ts",
  "src/hooks/useMotion.ts",
  "src/hooks/useVideo.ts",
]) {
  if (fs.existsSync(path.join(root, file))) failures.push(`FORBIDDEN stub file remains: ${file}`);
}

forbid("supabase/functions/beatvision-world/index.ts", [
  ["obsolete Vercel origin", /beat-vision-f8nn\.vercel\.app/],
]);
requireText("supabase/functions/beatvision-generation/index.ts", [
  ["explicit terminal success states", /\["completed", "complete", "succeeded", "success", "done", "finished"\]/],
  ["unknown states remain processing", /return "processing";\s*\n}/],
]);

const packageJson = JSON.parse(read("package.json"));
if (packageJson.scripts?.["production-audit"] !== "node scripts/production-audit.mjs") {
  failures.push("package.json: production-audit script is not wired");
}

if (failures.length) {
  console.error("PRODUCTION AUDIT: FAILED");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}

console.log("PRODUCTION AUDIT: PASS");
console.log("Canonical production route, World CORS, generation terminal-state handling, and stub cleanup verified.");
