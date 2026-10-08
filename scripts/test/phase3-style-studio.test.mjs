import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const helper = readFileSync(new URL("../../src/lib/formatCreativeText.ts", import.meta.url), "utf8");
const hook = readFileSync(new URL("../../src/hooks/useStyleStudio.ts", import.meta.url), "utf8");
const style = readFileSync(new URL("../../src/pages/StylePage.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20261008205500_fix_phase3_approval_trigger_conflict.sql", import.meta.url), "utf8");

test("approval functions let the database trigger own approved_at", () => {
  for (const functionName of ["approve_character", "approve_environment"]) {
    assert.match(migration, new RegExp("create or replace function public\\." + functionName + "\\(", "i"));
  }
  assert.match(migration, /set status\s*=\s*'approved'/i);
  assert.doesNotMatch(migration, /set\s+status\s*=\s*'approved'\s*,\s*approved_at/i);
  assert.match(migration, /p\.owner_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(migration, /security\s+definer/i);
});

test("draft continuity recovery exists and has source-world fallback", () => {
  assert.match(helper, /recoverWorldContinuity/);
  assert.match(hook, /recoverWorldContinuity/);
  assert.match(style, /recoverWorldContinuity|formatCreativeLines/);
});

test("Phase 3 screens normalize JSONB instead of coercing objects into textareas", () => {
  assert.match(helper, /formatCreativeRecord/);
  assert.match(hook, /formatCreativeRecord/);
  assert.match(style, /formatCreativeLines/);
});

test("approval errors preserve structured PostgREST messages", () => {
  assert.match(hook, /getCreativeErrorMessage/);
  assert.match(helper, /error_description/);
});

test("the code does not allow approved character or environment sheet edits", () => {
  assert.match(hook, /status\s*===\s*"approved"/);
  for (const component of ["CharacterEditor", "EnvironmentEditor"]) {
    const source = readFileSync(new URL("../../src/components/style/" + component + ".tsx", import.meta.url), "utf8");
    assert.match(source, /readOnly/);
    assert.match(source, /role="alert"/);
  }
});

test("draft sheet saving preserves unedited structured JSONB values", () => {
  assert.match(helper, /export function mergeCreativeSheet/);
  assert.match(helper, /formatCreativeText\(source\[field\]\) === value/);
  assert.match(hook, /mergeCreativeSheet\(rawCharacterSheets\.current\.get\(id\), input\.sheet\)/);
  assert.match(hook, /mergeCreativeSheet\(rawEnvironmentSheets\.current\.get\(id\), input\.sheet\)/);
});

test("reference asset approvals do not conflict with approved_at trigger", () => {
  const branch = hook.slice(hook.indexOf("const approveAsset"));
  assert.match(branch, /status: "approved"/);
  assert.doesNotMatch(branch, /approved_at: new Date/);
});
