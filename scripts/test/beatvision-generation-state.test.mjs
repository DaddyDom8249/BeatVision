import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(
  path.join(root, "supabase/functions/beatvision-generation/index.ts"),
  "utf8",
);

test("generation controller requires an explicit terminal success state", () => {
  assert.match(
    source,
    /if \(\["completed", "complete", "succeeded", "success", "done", "finished"\]\.includes\(status\)\) return "completed";/,
  );
  assert.match(
    source,
    /return "processing";\n}/,
  );
});

test("generation controller does not treat unknown provider status as completed", () => {
  const block = source.match(/function terminalState[\s\S]*?\n}\n\nasync function setFailed/);
  assert.ok(block, "terminalState implementation must remain present");
  assert.doesNotMatch(
    block[0],
    /return "completed";\s*\n}/,
    "unknown provider states must not fall through to completed",
  );
  assert.match(block[0], /return "processing";/);
});

test("generation controller treats a synchronous Arena scene-image URL as completed", () => {
  const block = source.match(/function terminalState[\s\S]*?\n}\n\nasync function setFailed/);
  assert.ok(block, "terminalState implementation must remain present");
  assert.match(
    block[0],
    /jobType === "scene_image" && extractImageUrl\(data\).*return "completed";/s,
  );
  assert.match(
    source,
    /terminalState\(result\.response, result\.data, job\.job_type\)/,
  );
});
