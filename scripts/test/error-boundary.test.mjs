// Hardening 2026-10-14: render errors show a recoverable fallback, not a blank page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import ts from "typescript";
import { JSDOM } from "jsdom";

test("AppErrorBoundary renders an alert fallback when a child throws, and main.tsx uses it", async () => {
  const dom = new JSDOM("<div id=root></div>", { url: "https://beat-vision-theta.vercel.app/" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const src = readFileSync(new URL("../../src/components/AppErrorBoundary.tsx", import.meta.url), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dir = new URL("./.tmp-error-boundary/", import.meta.url); mkdirSync(dir, { recursive: true });
  const file = new URL("AppErrorBoundary.mjs", dir); writeFileSync(file, out);
  try {
    const { default: Boundary } = await import(file.href);
    const React = (await import("react")).default;
    const { createRoot } = await import("react-dom/client");
    const { act } = React;
    const logged = []; const origError = console.error; console.error = (...a) => logged.push(a);
    function Boom() { throw new Error("<img src=x onerror=alert(1)> internal detail"); }
    const root = createRoot(document.getElementById("root"));
    try { await act(async () => root.render(React.createElement(Boundary, null, React.createElement(Boom)))); }
    finally { console.error = origError; }
    const html = document.getElementById("root").innerHTML;
    assert.match(html, /role="alert"/);
    assert.match(html, /Something went wrong/);
    assert.ok(!html.includes("internal detail") && !html.includes("<img"), "error text must not be rendered");
    root.unmount();
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const main = readFileSync(new URL("../../src/main.tsx", import.meta.url), "utf8");
  assert.match(main, /<AppErrorBoundary>\s*<App \/>\s*<\/AppErrorBoundary>/);
});
