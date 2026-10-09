import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL("../../" + file, import.meta.url), "utf8");
const css = source("src/styles.css");
const assets = source("src/components/style/AssetList.tsx");

test("persisted Phase 3 character and environment editors share a styled card", () => {
  for (const name of ["CharacterEditor", "EnvironmentEditor"]) {
    const editor = source("src/components/style/" + name + ".tsx");
    assert.match(editor, /<article className="style-record-card">/);
    assert.match(editor, /onGenerate/);
    assert.match(editor, /readOnly=\{locked\}/);
  }
  assert.match(css, /\.style-record-card>form>label\{display:grid/);
  assert.match(css, /\.style-record-card>form>label>input,\.style-record-card>form>label>textarea\{/);
  assert.match(css, /\.style-record-card>form>label>textarea\{min-height:110px/);
  assert.match(css, /@media\(max-width:700px\)\{\.style-record-card\{padding:16px\}/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)/);
});

test("asset previews distinguish browser-incompatible HEIF from expired signed links", () => {
  assert.match(assets, /metadata\?\.mime_type/);
  assert.match(assets, /\(heif\|heic\)/);
  assert.match(assets, /HEIF\/HEIC reference saved, but this browser could not display its preview/);
  assert.match(assets, /Reference preview unavailable or its secure link expired/);
  assert.match(assets, /onError=\{\(\) => setPreviewFailed\(true\)\}/);
  assert.match(assets, /onRefresh && !isHeif/);
  assert.match(assets, /<details className="style-asset-storage">/);
  assert.match(css, /\.style-asset-storage code\{display:block/);
});
