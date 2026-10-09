import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const helperPath = new URL("../../src/lib/formatCreativeText.ts", import.meta.url);
const hookPath = new URL("../../src/hooks/useStyleStudio.ts", import.meta.url);
const stylePath = new URL("../../src/pages/StylePage.tsx", import.meta.url);
const migrationPath = new URL("../../supabase/migrations/20261008211633_fix_phase3_approval_trigger_conflict.sql", import.meta.url);

const helper = readFileSync(helperPath, "utf8");
const hook = readFileSync(hookPath, "utf8");
const style = readFileSync(stylePath, "utf8");
const migration = readFileSync(migrationPath, "utf8");

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

test("createStyleBible handles existing rows safely using maybeSingle to prevent PGRST116 coercion errors", () => {
  const branch = hook.slice(hook.indexOf("const createStyleBible"));
  assert.match(branch, /maybeSingle\(\)/);
  assert.match(branch, /if\s*\(existing\.error\)\s*throw\s+existing\.error/);
  assert.match(branch, /existing\.data/);
  assert.doesNotMatch(branch, /\.insert\(payload\)\.select\(styleFields\)\.single\(\)/);
});

test("StylePage presents error feedback and retry action on load failure rather than misleading Create button", () => {
  assert.match(style, /if\s*\(!styleBible\)\s*{\s*if\s*\(error\)/);
  assert.match(style, /Retry Style Studio Load/);
});

// Helper to extract the actual production createStyleBible callback body from src/hooks/useStyleStudio.ts
function extractCreateStyleBibleBody(hookSource) {
  const marker = "const createStyleBible = useCallback(async () => {";
  const startIndex = hookSource.indexOf(marker);
  if (startIndex === -1) {
    throw new Error("Extraction failed: createStyleBible definition not found in hook source.");
  }
  const bodyStart = hookSource.indexOf("{", startIndex) + 1;
  let depth = 1;
  let bodyEnd = bodyStart;
  while (depth > 0 && bodyEnd < hookSource.length) {
    const char = hookSource[bodyEnd];
    if (char === "{") depth++;
    else if (char === "}") depth--;
    bodyEnd++;
  }
  if (depth !== 0) {
    throw new Error("Extraction failed: mismatched braces parsing createStyleBible body.");
  }
  return hookSource.slice(bodyStart, bodyEnd - 1);
}

function getCreativeErrorMessageStub(error, fallback) {
  if (error && typeof error === "object") {
    const record = error;
    for (const key of ["message", "error_description", "details", "hint", "code"]) {
      if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
    }
  }
  return error instanceof Error ? error.message : fallback;
}

function instantiateActualCreateStyleBible(bodyText, context) {
  const wrappedTS = "async function createStyleBible() {\n" + bodyText + "\n}";
  const jsCode = transformSync(wrappedTS, { loader: "ts" }).code;

  const fnConstructor = new Function(
    "world",
    "projectId",
    "supabase",
    "setWorking",
    "setError",
    "setStyleBible",
    "getCreativeErrorMessage",
    "styleFields",
    `${jsCode}\nreturn createStyleBible();`
  );
  return fnConstructor(
    context.world,
    context.projectId,
    context.supabase,
    context.setWorking,
    context.setError,
    context.setStyleBible,
    context.getCreativeErrorMessage || getCreativeErrorMessageStub,
    context.styleFields || "id,project_id,status"
  );
}

test("createStyleBible actual implementation execution: lookup error rejects fast with zero INSERTs and clears working state", async () => {
  const bodyText = extractCreateStyleBibleBody(hook);
  assert.ok(bodyText.length > 50, "extracted createStyleBible body must not be empty");

  let insertCalls = 0;
  let updateCalls = 0;
  let workingState = null;
  let errorState = null;

  const mockSupabase = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: new Error("Precheck lookup database error") }),
        }),
      }),
      insert: () => {
        insertCalls++;
        return {
          select: () => ({
            maybeSingle: async () => ({ data: { id: "should-not-reach" }, error: null }),
          }),
        };
      },
      update: () => {
        updateCalls++;
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      },
    }),
  };

  const context = {
    world: { id: "w-1", status: "completed", confirmed_at: "2026-10-09T00:00:00Z" },
    projectId: "proj-1",
    supabase: mockSupabase,
    setWorking: (val) => { workingState = val; },
    setError: (msg) => { errorState = msg; },
    setStyleBible: () => {},
  };

  const createFn = () => instantiateActualCreateStyleBible(bodyText, context);

  await assert.rejects(
    () => createFn(),
    (err) => err.message === "Precheck lookup database error"
  );

  assert.equal(insertCalls, 0, "INSERT must not be called when precheck lookup returns an error");
  assert.equal(updateCalls, 0, "UPDATE must not be called when precheck lookup returns an error");
  assert.equal(workingState, false, "working state must clear to false after error");
  assert.equal(errorState, "Precheck lookup database error", "error state must be set to lookup error message");
});

test("createStyleBible actual implementation execution: existing row returned without calling INSERT or UPDATE", async () => {
  const bodyText = extractCreateStyleBibleBody(hook);

  let insertCalls = 0;
  let updateCalls = 0;
  let workingState = null;
  let styleBibleState = null;

  const existingRow = { id: "style-existing-123", status: "approved" };

  const mockSupabase = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: existingRow, error: null }),
        }),
      }),
      insert: () => {
        insertCalls++;
        return {
          select: () => ({
            maybeSingle: async () => ({ data: { id: "new-style-id" }, error: null }),
          }),
        };
      },
      update: () => {
        updateCalls++;
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      },
    }),
  };

  const context = {
    world: { id: "w-1", status: "completed", confirmed_at: "2026-10-09T00:00:00Z" },
    projectId: "proj-1",
    supabase: mockSupabase,
    setWorking: (val) => { workingState = val; },
    setError: () => {},
    setStyleBible: (val) => { styleBibleState = val; },
  };

  const result = await instantiateActualCreateStyleBible(bodyText, context);

  assert.deepEqual(result, existingRow);
  assert.deepEqual(styleBibleState, existingRow);
  assert.equal(insertCalls, 0, "INSERT must not be called when existing row is returned");
  assert.equal(updateCalls, 0, "UPDATE must not be called when existing row is returned");
  assert.equal(workingState, false, "working state must clear to false");
});

test("createStyleBible actual implementation execution: genuinely absent row calls INSERT exactly once and returns created row", async () => {
  const bodyText = extractCreateStyleBibleBody(hook);

  let insertCalls = 0;
  let workingState = null;
  let styleBibleState = null;

  const newRow = { id: "style-new-456", status: "draft" };

  const mockSupabase = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      insert: () => {
        insertCalls++;
        return {
          select: () => ({
            maybeSingle: async () => ({ data: newRow, error: null }),
          }),
        };
      },
    }),
  };

  const context = {
    world: { id: "w-1", status: "completed", confirmed_at: "2026-10-09T00:00:00Z" },
    projectId: "proj-1",
    supabase: mockSupabase,
    setWorking: (val) => { workingState = val; },
    setError: () => {},
    setStyleBible: (val) => { styleBibleState = val; },
  };

  const result = await instantiateActualCreateStyleBible(bodyText, context);

  assert.deepEqual(result, newRow);
  assert.deepEqual(styleBibleState, newRow);
  assert.equal(insertCalls, 1, "INSERT must be called exactly once for genuinely absent row");
  assert.equal(workingState, false, "working state must clear to false");
});

test("createStyleBible mutation sensitivity: removing lookup error guard causes fallthrough to INSERT on precheck error", async () => {
  const bodyText = extractCreateStyleBibleBody(hook);
  assert.match(bodyText, /if\s*\(existing\.error\)\s*throw\s+existing\.error/, "unmutated body must contain guard");

  // Create in-memory mutant by removing the lookup error guard
  const mutantBodyText = bodyText.replace(/if\s*\(existing\.error\)\s*throw\s+existing\.error;?/, "/* MUTATED: guard removed */");

  let mutantInsertCalls = 0;
  const mockSupabaseMutant = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: new Error("Precheck lookup database error") }),
        }),
      }),
      insert: () => {
        mutantInsertCalls++;
        return {
          select: () => ({
            maybeSingle: async () => ({ data: null, error: new Error("Insert duplicate key error") }),
          }),
        };
      },
    }),
  };

  const contextMutant = {
    world: { id: "w-1", status: "completed", confirmed_at: "2026-10-09T00:00:00Z" },
    projectId: "proj-1",
    supabase: mockSupabaseMutant,
    setWorking: () => {},
    setError: () => {},
    setStyleBible: () => {},
  };

  // The mutant will fall through and attempt insert, throwing "Insert duplicate key error" instead of failing fast on "Precheck lookup database error"
  await assert.rejects(
    () => instantiateActualCreateStyleBible(mutantBodyText, contextMutant),
    (err) => err.message === "Insert duplicate key error"
  );

  assert.equal(mutantInsertCalls, 1, "MUTANT DEMONSTRATION: removing guard caused fallthrough to INSERT call = 1");
});
