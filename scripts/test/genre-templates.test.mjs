import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const path = fileURLToPath(new URL("../../src/lib/style/genreTemplates.ts", import.meta.url));
const source = readFileSync(path, "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
runInNewContext(js, { module: mod, exports: mod.exports });
const { GENRE_TEMPLATES, applyGenreTemplate, getGenreTemplate } = mod.exports;
const empty = { visualRules: "", continuityRules: "", referenceAssets: "" };

test("gallery covers the requested genres with unique ids", () => {
  const ids = GENRE_TEMPLATES.map((t) => t.id);
  for (const id of ["hip-hop", "pop", "rock", "edm", "rnb", "country", "lo-fi"]) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
});

test("templates are text-only: no media URLs or file references", () => {
  const text = JSON.stringify(GENRE_TEMPLATES);
  assert.doesNotMatch(text, /https?:\/\/|\.(png|jpe?g|gif|webp|mp4|mov|webm)\b/i);
  assert.doesNotMatch(source, /supabase|fetch\(|storage/);
});

test("applies to empty draft fields and leaves reference assets untouched", () => {
  const r = applyGenreTemplate(empty, getGenreTemplate("edm"), { styleBibleStatus: "draft" });
  assert.equal(r.status, "applied");
  assert.deepEqual([...r.applied], ["visualRules", "continuityRules"]);
  assert.match(r.draft.visualRules, /Palette: Ultraviolet purple/);
  assert.match(r.draft.visualRules, /Camera: /);
  assert.equal(r.draft.referenceAssets, "");
});

test("never overwrites existing creator content in a draft", () => {
  const cur = { visualRules: "My rule", continuityRules: "", referenceAssets: "a.png" };
  const r = applyGenreTemplate(cur, getGenreTemplate("pop"), { styleBibleStatus: "draft" });
  assert.equal(r.draft.visualRules, "My rule");
  assert.deepEqual([...r.skipped], ["visualRules"]);
  assert.ok(r.draft.continuityRules.length > 0);
  assert.equal(r.draft.referenceAssets, "a.png");
});

test("refuses and never overwrites an APPROVED style bible, even with empty fields", () => {
  for (const cur of [empty, { visualRules: "Approved rule", continuityRules: "Approved c", referenceAssets: "" }]) {
    const r = applyGenreTemplate(cur, getGenreTemplate("rock"), { styleBibleStatus: "approved" });
    assert.equal(r.status, "refused");
    assert.deepEqual({ ...r.draft }, cur);
    assert.equal(r.applied.length, 0);
  }
});

test("does not mutate the input draft", () => {
  const cur = { ...empty };
  applyGenreTemplate(cur, getGenreTemplate("lo-fi"), { styleBibleStatus: "draft" });
  assert.deepEqual(cur, empty);
});

test("StylePage wires the gallery through applyGenreTemplate with the bible status and hides it when locked", () => {
  const page = readFileSync(fileURLToPath(new URL("../../src/pages/StylePage.tsx", import.meta.url)), "utf8");
  assert.match(page, /applyGenreTemplate\(/);
  assert.match(page, /styleBibleStatus: styleBible\?\.status/);
  assert.match(page, /<GenreTemplateGallery locked=\{locked\}/);
  const gallery = readFileSync(fileURLToPath(new URL("../../src/components/style/GenreTemplateGallery.tsx", import.meta.url)), "utf8");
  assert.match(gallery, /if \(locked\)/);
  assert.doesNotMatch(gallery, /<img|<video/);
});
