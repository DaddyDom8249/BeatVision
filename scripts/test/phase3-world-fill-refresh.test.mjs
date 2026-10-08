import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
function compiledModule(source, customRequire = () => { throw new Error("Unexpected import"); }) {
  const target = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  runInNewContext(code, { module: target, exports: target.exports, require: customRequire });
  return target.exports;
}

const creative = compiledModule(read("src/lib/formatCreativeText.ts"));
const suggestions = compiledModule(read("src/lib/style/worldSheetSuggestions.ts"), (name) => {
  assert.equal(name, "../formatCreativeText");
  return creative;
});

const ghastWorld = {
  environments: [
    { setting: "abandoned urban space", description: "cracked concrete, graffiti, night sky" },
    { setting: "abstract mindscape", description: "floating geometric shapes, shifting textures" },
    { setting: "dimly lit interior", description: "shadowy rooms, flickering lights" },
  ],
  color_lighting: {
    palette: ["deep blue", "charcoal gray", "muted red", "black"],
    lighting_style: "low-key with rim and backlight",
  },
  atmosphere: "oppressive, introspective, claustrophobic, raw",
  continuity_rules: [{ rule: "maintain consistent color palette across shots" }],
  movement: { subject_behavior: "slow, hesitant, fragmented, occasional jerky motion" },
  immutable_continuity: { color_palette: "deep blue, charcoal, muted red" },
};

test("old Ghast draft environments receive World-supported text in missing slots", () => {
  const urban = suggestions.suggestMissingWorldFields({
    purpose: "Artist-authored purpose",
    layout: "cracked concrete, graffiti, night sky",
    lighting: "",
    surfaces: "",
  }, ghastWorld, "environment", "abandoned urban space", "draft");
  assert.equal(urban.sheet.purpose, "Artist-authored purpose");
  assert.ok(urban.sheet.surfaces.includes("graffiti"));
  assert.ok(urban.sheet.lighting.includes("low-key with rim"));
  assert.ok(urban.sheet.continuity.includes("consistent color palette"));
  assert.ok(urban.suggestedFields.includes("surfaces"));
  assert.ok(!urban.suggestedFields.includes("purpose"));
  assert.equal(urban.sheet.architecture, "");
});

test("mindscape textures are sourced while no architecture is invented", () => {
  const mind = suggestions.worldSheetSuggestions(ghastWorld, "environment", "abstract mindscape");
  assert.equal(mind.surfaces, "floating geometric shapes, shifting textures");
  assert.equal(mind.architecture, "");
  const interior = suggestions.worldSheetSuggestions(ghastWorld, "environment", "dimly lit interior");
  assert.equal(interior.surfaces, "");
  assert.equal(interior.layout, "shadowy rooms, flickering lights");
});

test("explicit World character behavior is used without manufacturing appearance", () => {
  const figure = suggestions.worldSheetSuggestions(ghastWorld, "character", "Central Figure");
  assert.equal(figure.behavior, "slow, hesitant, fragmented, occasional jerky motion");
  assert.equal(figure.appearance, "");
  assert.equal(figure.wardrobe, "");
});

test("approved records remain unchanged even when World has more information", () => {
  const existing = { lighting: "", purpose: "Approved creator description" };
  const approved = suggestions.suggestMissingWorldFields(existing, ghastWorld, "environment",
    "abandoned urban space", "approved");
  assert.deepEqual(Object.keys(approved.sheet).sort(), Object.keys(existing).sort());
  assert.equal(approved.sheet.lighting, "");
  assert.equal(approved.suggestedFields.length, 0);
});

test("live save paths keep existing inputs mounted instead of switching to loading screen", () => {
  const hook = read("src/hooks/useStyleStudio.ts");
  const style = read("src/pages/StylePage.tsx");
  assert.match(hook, /if \(!hasStartedLoad\.current\)\s*\{\s*hasStartedLoad\.current = true;\s*setLoading\(true\)/);
  assert.match(hook, /suggestMissingWorldFields\(/);
  assert.match(style, /styleBible\?\.updated_at/);
  for (const name of ["CharacterEditor", "EnvironmentEditor"]) {
    const editor = read("src/components/style/" + name + ".tsx");
    assert.match(editor, /updated_at, (?:character|environment)\.status\]/);
    assert.match(editor, /suggested_world_fields/);
    assert.match(editor, /Select Save/);
  }
});
