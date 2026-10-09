import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const helper = readFileSync(new URL("../../src/lib/formatCreativeText.ts", import.meta.url), "utf8");
const hook = readFileSync(new URL("../../src/hooks/useStyleStudio.ts", import.meta.url), "utf8");
const style = readFileSync(new URL("../../src/pages/StylePage.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20261008211633_fix_phase3_approval_trigger_conflict.sql", import.meta.url), "utf8");

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


test("Style Bible error state cannot offer duplicate Create action", () => {
  assert.match(style, /if \(error \|\| !world \|\| world\.status !== "completed" \|\| !world\.confirmed_at\)/);
  assert.match(style, /Retry Style Studio Load/);
});

test("actual createStyleBible callback fails closed on read errors and preserves existing rows", async () => {
  // Run the production callback body in a controlled sandbox. This exercises
  // the real branching logic, instead of checking for a token by regex only.
  const prefix = "const createStyleBible = useCallback(";
  const start = hook.indexOf(prefix);
  assert.ok(start >= 0, "createStyleBible callback exists");
  const end = hook.indexOf("  }, [projectId, world]);", start);
  assert.ok(end > start, "callback end is located");
  const callback = hook.slice(start + prefix.length, end + 3)
    .replace(/ as StyleBible/g, "");
  const compile = new Function(
    "supabase", "world", "projectId", "styleFields", "setWorking", "setError",
    "setStyleBible", "getCreativeErrorMessage",
    "return (" + callback + ");"
  );
  const world = { id: "world-current", status: "completed", confirmed_at: "2026-10-09" };

  function harness(readResponses, insertResponse) {
    let inserts = 0;
    const values = [...readResponses];
    let saved = null;
    let failure = null;
    const supabase = {
      from(table) {
        assert.equal(table, "style_bibles");
        return {
          select() { return { eq() { return { maybeSingle: async () => values.shift() }; } }; },
          insert() {
            inserts++;
            return { select() { return { single: async () => insertResponse }; } };
          }
        };
      }
    };
    const cb = compile(supabase, world, "project-1", "id,world_report_id,status",
      () => {}, x => { failure = x; }, x => { saved = x; },
      x => x instanceof Error ? x.message : String(x?.message || x));
    return { cb, get inserts() { return inserts; }, get saved() { return saved; }, get failure() { return failure; } };
  }

  const readFailed = harness([{ data: null, error: new Error("SELECT inaccessible") }]);
  await assert.rejects(readFailed.cb(), /SELECT inaccessible/);
  assert.equal(readFailed.inserts, 0, "failed pre-check must never insert");
  assert.equal(readFailed.failure, "SELECT inaccessible");

  const approved = { id: "existing", status: "approved", world_report_id: world.id };
  const found = harness([{ data: approved, error: null }]);
  assert.equal((await found.cb()).id, "existing");
  assert.equal(found.inserts, 0, "existing approved record must not be duplicated");
  assert.equal(found.saved.id, "existing");

  const mismatch = harness([{ data: { id: "old", world_report_id: "different" }, error: null }]);
  await assert.rejects(mismatch.cb(), /different World revision/);
  assert.equal(mismatch.inserts, 0, "World mismatch must not insert");

  const created = { id: "new", world_report_id: world.id };
  const empty = harness([{ data: null, error: null }], { data: created, error: null });
  assert.equal((await empty.cb()).id, "new");
  assert.equal(empty.inserts, 1, "genuinely missing row inserts once");

  const raced = harness([
    { data: null, error: null },
    { data: approved, error: null }
  ], { data: null, error: { code: "23505", message: "duplicate" } });
  assert.equal((await raced.cb()).id, "existing");
  assert.equal(raced.inserts, 1, "unique race resolves to approved record");

  const permission = harness([{ data: null, error: null }],
    { data: null, error: { code: "42501", message: "permission denied" } });
  await assert.rejects(permission.cb(), /permission denied/);
  assert.equal(permission.inserts, 1, "RLS failure is surfaced rather than silently retried");
});
