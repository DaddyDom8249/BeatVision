import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = (name) => readFileSync(new URL("../../" + name, import.meta.url), "utf8");
const hook = file("src/hooks/useStyleStudio.ts");
const assetList = file("src/components/style/AssetList.tsx");

test("an approved Style Bible does not prevent approving a new reference asset", () => {
  const start = hook.indexOf("  const approveAsset =");
  assert.ok(start > -1);
  const end = hook.indexOf("\n  return {", start);
  assert.ok(end > start);
  const scope = hook.slice(start, end);
  assert.match(scope, /if \(!styleBible \|\| !world\?\.confirmed_at\)/);
  assert.doesNotMatch(scope, /styleBible\.status === "approved"/);
  assert.match(scope, /\.from\(table\)\.update\(\{/);
  assert.match(scope, /status: "approved"/);
  assert.match(scope, /\.eq\("id", assetId\)\.eq\("status", "draft"\)/);
  assert.match(scope, /if \(result\.error\) throw result\.error/);
  assert.match(scope, /await load\(\)/);
  // Ownership is still enforced by production RLS, not bypassed via service-role.
  assert.doesNotMatch(scope, /service_role|security_definer|bypassrls/i);
});

test("expired or broken signed URLs render one clear fallback, not duplicate image alt text", () => {
  assert.match(assetList, /onError=\{\(\) => setPreviewFailed\(true\)\}/);
  assert.match(assetList, /Reference preview unavailable or its secure link expired/);
  assert.match(assetList, /asset\.signed_url && !previewFailed/);
  assert.match(assetList, /Refresh image preview/);
  assert.match(assetList, /onRefresh\(\)\.catch/);
});

test("refresh reaches the existing background reload without unmounting input forms", () => {
  const style = file("src/pages/StylePage.tsx");
  assert.match(style, /onRefresh=\{reload\}/);
  for (const type of ["CharacterEditor", "EnvironmentEditor"]) {
    const editor = file("src/components/style/" + type + ".tsx");
    assert.match(editor, /onRefresh\?: \(\) => Promise<unknown>/);
    assert.match(editor, /<AssetList assets=\{assets\} onRefresh=\{onRefresh\}/);
  }
  assert.match(hook, /if \(!hasStartedLoad\.current\)/);
});
