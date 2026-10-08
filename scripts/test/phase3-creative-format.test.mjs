import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Compile the real TypeScript helper rather than an alternate mock implementation.
const source = readFileSync(new URL("../../src/lib/formatCreativeText.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
runInNewContext(javascript, { module, exports: module.exports });
const {
  formatCreativeText,
  formatCreativeLines,
  formatCreativeRecord,
  recoverWorldContinuity,
  mergeCreativeSheet,
  getCreativeErrorMessage,
} = module.exports;

test("formats Ghast-shaped World JSONB into readable text", () => {
  const raw = {
    rules: [{ rule: "Maintain deep blue palette" }, { rule: "Keep broken-mirror motif" }],
    motifs: ["loaded gun", "circles"],
  };
  const text = formatCreativeText(raw);
  assert.ok(text.includes("Maintain deep blue palette"));
  assert.ok(text.includes("Keep broken-mirror motif"));
  assert.ok(text.includes("loaded gun"));
  assert.ok(!text.includes("[object Object]"));
});

test("recovers only wholly corrupted draft continuity rules", () => {
  const fromWorld = [{ rule: "Keep lighting consistent" }, { rule: "Camera movement is deliberate" }];
  assert.equal(recoverWorldContinuity(["[object Object]", "[object Object]"], fromWorld).join("|"), "Keep lighting consistent|Camera movement is deliberate");
  assert.equal(recoverWorldContinuity(["Creator override", "[object Object]"], fromWorld)[0], "Creator override");
});

test("formats nested lighting fields while preserving author strings", () => {
  const lighting = { palette: ["deep blue", "charcoal"], lighting_style: "low-key rimlight" };
  assert.ok(formatCreativeText(lighting).includes("low-key rimlight"));
  assert.equal(formatCreativeText("deliberate slow pan"), "deliberate slow pan");
  assert.equal(formatCreativeText("[object Object]"), "");
  assert.equal(formatCreativeRecord({ continuity: { rules: [{ rule: "Only blue light" }] } }).continuity.includes("Only blue light"), true);
  assert.equal(formatCreativeLines([{ rule: "A" }, { rule: "B" }]).join(","), "A,B");
});

test("preserves untouched nested sheet data and only replaces edited values", () => {
  const old = { continuity: { rules: [{ rule: "Keep palette" }] }, lighting: { palette: ["blue"] } };
  const next = mergeCreativeSheet(old, {
    continuity: formatCreativeText(old.continuity),
    lighting: "changed intentionally",
  });
  assert.equal(next.continuity, old.continuity);
  assert.equal(next.lighting, "changed intentionally");
});

test("surfaces structured PostgREST errors", () => {
  assert.equal(getCreativeErrorMessage({ message: "APPROVED_AT_DATABASE_AUTHORITY", details: "trigger" }, "fallback"), "APPROVED_AT_DATABASE_AUTHORITY");
  assert.equal(getCreativeErrorMessage({ error_description: "Permission denied" }, "fallback"), "Permission denied");
});
