import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("legacy completed Worlds remain readable while new World Reveal stays gated", async () => {
  const source = await readFile(new URL("../../src/pages/WorldPage.tsx", import.meta.url), "utf8");
  assert.match(source, /\(!song\.current_interpretation_id \|\| !song\.interpretation_confirmed_at\) && report\?\.status !== "completed"/);
  assert.match(source, /server independently enforces lineage/);
});
