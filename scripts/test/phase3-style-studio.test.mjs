import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
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
  await assert.rejects(permission.cb(), (error) => {
    assert.equal(error.code, "42501");
    assert.equal(error.message, "permission denied");
    return true;
  });
  assert.equal(permission.inserts, 1, "RLS failure is surfaced rather than silently retried");
});


test("confirmed World without Style Bible shows creation gate and never queries an empty UUID", async () => {
  const start = hook.indexOf("  const load = useCallback(async () => {");
  const endMarker = "  }, [projectId]);";
  const end = hook.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "real Style Studio load callback can be located");

  // Execute the actual hook load callback, not a copied approximation.
  const compiled = ts.transpileModule(
    hook.slice(start, end + endMarker.length) + "\nreturn load;",
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  const reads = [];
  const filters = [];
  const state = {};
  const report = { id: "world-current", status: "completed", confirmed_at: "2026-10-10" };
  const results = {
    projects: { data: { world_report_id: report.id }, error: null },
    world_reports: { data: report, error: null },
    style_bibles: { data: null, error: null },
  };
  const supabase = {
    from(table) {
      reads.push(table);
      if (!Object.hasOwn(results, table)) throw new Error("Unexpected read of " + table);
      return {
        select() { return this; },
        eq(field, value) {
          filters.push({ table, field, value });
          if (value === "") throw new Error("Empty UUID sent to PostgREST");
          return this;
        },
        single: async () => results[table],
        maybeSingle: async () => results[table],
      };
    },
  };
  const setters = ["setLoading", "setError", "setWorld", "setStyleBible",
    "setCharacters", "setCharacterAssets", "setEnvironments", "setEnvironmentAssets"];
  const construct = new Function(
    "useCallback", "supabase", "projectId", "hasStartedLoad", "styleFields", ...setters,
    compiled,
  );
  const args = setters.map(name => value => { state[name.slice(3).toLowerCase()] = value; });
  const load = construct(fn => fn, supabase, "project-current", { current: false }, "id,project_id,status", ...args);
  await load();

  assert.deepEqual(reads, ["projects", "world_reports", "style_bibles"]);
  assert.ok(filters.every(item => item.value !== ""));
  assert.equal(state.world?.id, report.id, "confirmed World remains available");
  assert.equal(state.stylebible, null, "missing style is genuinely absent, not an error");
  assert.deepEqual(state.characters, []);
  assert.deepEqual(state.environments, []);
  assert.equal(state.loading, false);
  assert.equal(state.error, null);
  assert.doesNotMatch(hook, /currentStyleBible\?\.id\s*\?\?\s*""/, "no empty string UUID fallback remains");
});


test("another-go World produces persisted central figure and enriched Dim Apartment draft without invented details", () => {
  // Execute the same World-to-drafts compiler used by the real Style hook.
  const worldSheets = readFileSync(new URL("../../src/lib/style/worldSheetSuggestions.ts", import.meta.url), "utf8");
  const start = hook.indexOf("function materializeWorldDrafts(");
  const end = hook.indexOf("\nasync function ensureWorldDrafts(", start);
  assert.ok(start >= 0 && end > start);
  const source = [
    helper.replace(/^export /gm, ""),
    worldSheets.replace(/^import .*;\s*$/gm, "").replace(/^export /gm, ""),
    hook.slice(start, end),
    "return materializeWorldDrafts;",
  ].join("\n");
  const js = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  }}).outputText;
  const compile = new Function(js)();

  const world = {
    id: "world-another-go",
    raw_report: { model_output: { movement: { style: "Slow, deliberate" } } },
    immutable_continuity: [
      "The visual palette remains dark and muted with occasional blue accents.",
      "The central figure is a male.",
    ],
    continuity_rules: [{ rule: "Lighting must remain consistent" }],
    movement: { style: "Slow, deliberate", description: "Camera movements" },
    motifs: [{ name: "Broken Mirror" }],
    environments: [{
      name: "Dim Apartment",
      description: "One room with a desk and a window.",
      props: ["desk", "chair", "mirror"],
      key_elements: ["window light", "shadow patterns"],
    }],
    color_lighting: { lighting_style: "Low-key, high contrast" },
    atmosphere: "Introspective",
  };
  const result = compile(world, "project-another-go", "bible-another-go");
  assert.equal(result.characters.length, 1);
  assert.equal(result.characters[0].name, "Central Figure");
  assert.equal(result.characters[0].status, "draft", "never auto-approve an inferred sheet");
  assert.match(result.characters[0].sheet.identity, /central figure is a male/i);
  assert.equal(result.characters[0].sheet.appearance, "", "do not invent an appearance");
  assert.equal(result.characters[0].sheet.wardrobe, "", "do not invent a costume");
  assert.equal(result.characters[0].sheet.behavior, "", "camera movement is not subject behavior");
  assert.equal(result.environments.length, 1);
  const env = result.environments[0];
  assert.equal(env.name, "Dim Apartment");
  assert.equal(env.status, "draft");
  assert.equal(env.project_id, "project-another-go");
  assert.match(env.sheet.purpose, /one room with a desk/i);
  assert.match(env.sheet.layout, /window light/i);
  assert.match(env.sheet.layout, /shadow patterns/i);
  assert.match(env.sheet.surfaces, /desk/i);
  assert.match(env.sheet.surfaces, /mirror/i);
  assert.match(env.sheet.lighting, /low-key/i);
  assert.match(env.sheet.continuity, /lighting must remain consistent/i);

  const ghast = { ...world, movement: { subject_behavior: "slow hesitant steps" },
    immutable_continuity: { color_palette: "deep blue" },
    environments: [{ setting: "abstract mindscape", description: "shifting textures" }],
  };
  const ghastResult = compile(ghast, "ghast", "bible");
  assert.equal(ghastResult.characters[0].sheet.behavior, "slow hesitant steps");
  assert.equal(ghastResult.environments[0].name, "abstract mindscape");

  const sceneryOnly = { ...world, immutable_continuity: [], movement: {}, raw_report: {},
    motifs: ["mirrors"], environments: ["Courtyard"] };
  assert.equal(compile(sceneryOnly, "scenery", "bible").characters.length, 0,
    "motifs do not justify inventing a person");
  assert.equal(compile(sceneryOnly, "scenery", "bible").environments.length, 1);

  // Existing/new Bible transition must repopulate without a reload or manual Save.
  assert.match(hook, /if \(!styleBible\?\.id\) return;\s*void load\(\)\.catch/s);
});

test("World-draft backfill is idempotent and preserves approved creator sheets", async () => {
  const worldSheets = readFileSync(new URL("../../src/lib/style/worldSheetSuggestions.ts", import.meta.url), "utf8");
  const start = hook.indexOf("function materializeWorldDrafts(");
  const end = hook.indexOf("\nexport function useStyleStudio(", start);
  assert.ok(start >= 0 && end > start);
  const source = [
    helper.replace(/^export /gm, ""),
    worldSheets.replace(/^import .*;\s*$/gm, "").replace(/^export /gm, ""),
    hook.slice(start, end),
    "return ensureWorldDrafts;",
  ].join("\n");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  }}).outputText;
  const existing = {
    characters: [{ id: "approved-1", name: "Central Figure", status: "approved",
      sheet: { identity: "Original artist-approved person" } }],
    environments: [],
  };
  const writes = [];
  const supabase = { from(table) {
    assert.ok(["characters", "environments"].includes(table));
    return {
      select() { return this; },
      eq() { return this; },
      then(resolve, reject) {
        return Promise.resolve({ data: existing[table].map(row => ({ id: row.id, name: row.name })), error: null })
          .then(resolve, reject);
      },
      async insert(rows) {
        writes.push({ table, rows });
        existing[table].push(...rows.map((row, i) => ({ ...row, id: table + "-" + i })));
        return { error: null };
      },
    };
  } };
  const ensure = new Function("supabase", compiled)(supabase);
  const world = { id: "world-1", immutable_continuity: ["The central figure is a male."],
    environments: [{ name: "Dim Apartment", description: "Room with a desk" }],
    continuity_rules: [], raw_report: {}, movement: {}, color_lighting: {}, atmosphere: "" };
  const bible = { id: "bible-1" };
  await ensure(world, "project-1", bible);
  await ensure(world, "project-1", bible);
  assert.equal(writes.length, 1, "insert only a missing environment, once");
  assert.equal(writes[0].table, "environments");
  assert.equal(existing.environments.length, 1);
  assert.equal(existing.characters.length, 1, "approved character never replaced or duplicated");
  assert.equal(existing.characters[0].sheet.identity, "Original artist-approved person");
});
