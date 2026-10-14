import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const styleSource = readFileSync(new URL("../../src/pages/StylePage.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");

function renderStyle(locked) {
  const bible = {
    id: "bible-1",
    status: locked ? "approved" : "draft",
    visual_rules: [],
    reference_assets: [],
    continuity_rules: [],
    world_basis: {},
  };
  const hook = {
    world: { id: "world-1", status: "completed", confirmed_at: "2026-10-10" },
    styleBible: bible,
    characters: [],
    characterAssets: [],
    environments: [],
    environmentAssets: [],
    loading: false, working: false, error: null, locked,
  };
  const runtime = {
    jsx(type, props) { return { type, props: props ?? {} }; },
    jsxs(type, props) { return { type, props: props ?? {} }; },
  };
  const code = ts.transpileModule(styleSource, { compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  }}).outputText;
  const mod = { exports: {} };
  const requireMock = (path) => {
    if (path === "react") return {
      useState(initial) { return [initial, () => {}]; },
      useEffect() {},
    };
    if (path === "react/jsx-runtime") return runtime;
    if (path === "../hooks/useStyleStudio") return { useStyleStudio: () => hook };
    if (path === "../lib/formatCreativeText") return { formatCreativeLines: () => [] };
    if (path === "../components/style/CharacterEditor" ||
        path === "../components/style/EnvironmentEditor") return { default: () => null };
    throw new Error("Unexpected StylePage dependency: " + path);
  };
  runInNewContext(code, { module: mod, exports: mod.exports, require: requireMock });
  return mod.exports.default({ projectId: "project-123" });
}

function collect(node) {
  if (Array.isArray(node)) return node.flatMap(collect);
  if (!node || typeof node !== "object") return [];
  return [node, ...collect(node.props?.children)];
}

test("locked mobile Style Studio exposes Visual Plan action at top and bottom", () => {
  const links = collect(renderStyle(true)).filter(item =>
    item.type === "a" && item.props.href === "/projects/project-123/visual-plan");
  assert.equal(links.length, 2, "top and bottom should both offer forward navigation");
  for (const link of links) {
    assert.match(link.props.className, /primary-button/);
    assert.match(String(link.props.children), /Continue to Visual Plan/);
  }
  assert.match(cssSource, /@media\s*\(max-width:900px\).*?\.studio-sidebar\{display:none\}/s,
    "sidebar is hidden on mobile, so the explicit next-stage link must stay visible");
  assert.match(cssSource, /\.style-stage-navigation\s*\{/,
    "navigation should wrap and remain accessible in a narrow viewport");
});

test("draft Style Studio requires a lock instead of bypassing the next-stage gate", () => {
  const nodes = collect(renderStyle(false));
  assert.equal(nodes.filter(item => item.type === "a" &&
    item.props.href === "/projects/project-123/visual-plan").length, 0);
  assert.ok(nodes.some(item => item.props.role === "status" &&
    String(item.props.children).includes("Lock the Style Bible")));
  assert.ok(nodes.some(item => item.type === "button" &&
    String(item.props.children).includes("Lock Style Bible")));
});
