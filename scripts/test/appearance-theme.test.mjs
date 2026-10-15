import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import ts from "typescript";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = await mkdtemp(join(root, ".appearance-test-"));
const compile = async (path, output, replacements = []) => {
  let source = await readFile(join(root, path), "utf8");
  for (const [before, after] of replacements) source = source.replaceAll(before, after);
  await writeFile(join(dir, output), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
  }).outputText);
};

await compile("src/theme/appearance.ts", "appearance.mjs");
await compile("src/theme/ThemeProvider.tsx", "provider.mjs", [
  ['"../lib/supabase/client"', '"./supabase.mjs"'],
  ['"./appearance"', '"./appearance.mjs"'],
]);
await compile("src/components/navigation/AppearanceSettings.tsx", "settings.mjs", [
  ['"../../theme/ThemeProvider"', '"./provider.mjs"'],
]);
await writeFile(join(dir, "supabase.mjs"), "export const supabase = { auth: new Proxy({}, {get: (_, key) => globalThis.__appearanceAuth[key]}) };");

const appearance = await import(pathToFileURL(join(dir, "appearance.mjs")).href);
const { ThemeProvider } = await import(pathToFileURL(join(dir, "provider.mjs")).href);
const { default: AppearanceSettings } = await import(pathToFileURL(join(dir, "settings.mjs")).href);
after(async () => rm(dir, { recursive: true, force: true }));

async function mount({ local = null, account = null } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://beatvision.test" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const writes = [];
  if (local) dom.window.localStorage.setItem(appearance.APPEARANCE_STORAGE_KEY, JSON.stringify(local));
  globalThis.__appearanceAuth = {
    getUser: async () => ({ data: { user: account === null ? null : { id: "user-1", user_metadata: { beatvision_appearance: account } } }, error: null }),
    updateUser: async (update) => { writes.push(update); return { data: { user: { id: "user-1" } }, error: null }; },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  };
  const reactRoot = createRoot(document.getElementById("root"));
  await act(async () => reactRoot.render(React.createElement(ThemeProvider, null, React.createElement(AppearanceSettings))));
  const click = async (label) => {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent.includes(label));
    assert.ok(button, "Theme option " + label + " must be present");
    await act(async () => button.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  };
  const cleanup = async () => {
    await act(async () => reactRoot.unmount());
    dom.window.close();
    delete globalThis.__appearanceAuth;
  };
  return { dom, writes, click, cleanup };
}

test("Classic is the safe default; user can switch to Arcane and back without a route change", async () => {
  const view = await mount();
  try {
    assert.equal(document.documentElement.dataset.beatvisionTheme, "classic");
    assert.equal(document.querySelector(".classic-preview").getAttribute("aria-pressed"), "true");
    await view.click("Arcane Cinema");
    assert.equal(document.documentElement.dataset.beatvisionTheme, "arcane");
    assert.equal(document.querySelector(".arcane-preview").getAttribute("aria-pressed"), "true");
    assert.equal(JSON.parse(view.dom.window.localStorage.getItem(appearance.APPEARANCE_STORAGE_KEY)).theme, "arcane");
    await view.click("Classic");
    assert.equal(document.documentElement.dataset.beatvisionTheme, "classic");
    assert.equal(view.writes.length, 0, "Signed-out theme changes must not mutate server state");
  } finally { await view.cleanup(); }
});

test("An authenticated account preference overrides a stale local preference", async () => {
  const view = await mount({
    local: { theme: "classic", reducedMotion: false },
    account: { theme: "arcane", reducedMotion: true },
  });
  try {
    assert.equal(document.documentElement.dataset.beatvisionTheme, "arcane");
    assert.equal(document.documentElement.dataset.beatvisionReducedMotion, "true");
    assert.equal(JSON.parse(view.dom.window.localStorage.getItem(appearance.APPEARANCE_STORAGE_KEY)).theme, "arcane");
  } finally { await view.cleanup(); }
});

test("Theme and motion controls persist through user metadata without touching project data", async () => {
  const view = await mount({ account: { theme: "classic", reducedMotion: false } });
  try {
    await view.click("Arcane Cinema");
    const checkbox = document.querySelector('.appearance-motion input[type="checkbox"]');
    await act(async () => checkbox.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.equal(document.documentElement.dataset.beatvisionReducedMotion, "true");
    assert.equal(view.writes.length, 2);
    assert.deepEqual(view.writes.at(-1), {
      data: { beatvision_appearance: { theme: "arcane", reducedMotion: true } },
    });
    assert.match(document.querySelector(".appearance-status").textContent, /Saved to your account/);
  } finally { await view.cleanup(); }
});

test("Invalid/corrupt local preferences fail closed to Classic", async () => {
  const view = await mount();
  try {
    assert.equal(appearance.parseAppearance({ theme: "unknown" }), null);
    view.dom.window.localStorage.setItem(appearance.APPEARANCE_STORAGE_KEY, "not-json");
    assert.equal(appearance.readLocalAppearance().theme, "classic");
  } finally { await view.cleanup(); }
});

test("Arcane CSS is scoped; reduced motion and narrow-screen settings are present", async () => {
  const css = await readFile(join(root, "src/theme/arcane.css"), "utf8");
  assert.match(css, /:root\[data-beatvision-theme="arcane"\]/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /max-width:\s*700px/);
  assert.match(css, /\.appearance-panel/);
});
