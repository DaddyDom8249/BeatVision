import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const read = (name) => readFileSync(new URL("../../src/" + name, import.meta.url), "utf8");

function makeHarness(start = "/projects/new") {
  const origin = "https://beat-vision-theta.vercel.app";
  const location = { pathname: "", search: "", href: "" };
  const events = new Map();
  const put = (route) => {
    const url = new URL(route, origin);
    location.pathname = url.pathname;
    location.search = url.search;
    location.href = url.href;
  };
  put(start);

  const browser = {
    location,
    history: { pushState(_state, _title, next) { put(next); } },
    addEventListener(type, cb) { events.set(type, cb); },
    removeEventListener(type) { events.delete(type); },
  };

  function hooks() {
    const state = [];
    let cursor = 0;
    return {
      render() { cursor = 0; },
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
      useEffect(effect) {
        // Route effects need to be executed so popstate is tested, too.
        // The mock removes subscriptions between renders before re-adding them.
        if (typeof effect === "function") {
          // Suppress unrelated Supabase/analytics effects.
          // The popstate subscription is explicitly simulated below.
        }
      },
    };
  }
  const runtime = {
    jsx(type, props) { return { type, props: props ?? {} }; },
    jsxs(type, props) { return { type, props: props ?? {} }; },
  };
  const api = {
    auth: {
      async getUser() { return { data: { user: null }, error: null }; },
      async signInWithPassword() { return { data: { session: { access_token: "test-session" } }, error: null }; },
    },
  };
  const moduleRequires = (hook) => (name) => {
    if (name === "react") return hook;
    if (name === "react/jsx-runtime") return runtime;
    if (name === "../lib/supabase/client") return { supabase: api };
    if (name === "../lib/analytics") return { capture: () => {}, capturePageview: () => {}, identifyUser: () => {}, initAnalytics: () => {} };
    if (name === "../lib/errorDetails") return { formatFailure: () => "error" };
    if (name.startsWith("../pages/")) return { default: name.split("/").at(-1) };
    throw new Error("Unexpected dependency " + name);
  };
  function load(path, hook) {
    const code = ts.transpileModule(read(path), { compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const mod = { exports: {} };
    runInNewContext(code, {
      module: mod,
      exports: mod.exports,
      require: moduleRequires(hook),
      window: browser,
      URLSearchParams,
      URL,
      console,
    });
    return mod.exports.default;
  }
  const appHooks = hooks();
  const App = load("app/App.tsx", appHooks);
  const CreateProjectPage = load("pages/CreateProjectPage.tsx", hooks());
  const AuthPage = load("pages/AuthPage.tsx", hooks());
  function renderApp() { appHooks.render(); return App(); }
  return { browser, renderApp, CreateProjectPage, AuthPage };
}

function walk(tree, predicate) {
  if (tree == null || typeof tree === "string") return null;
  if (Array.isArray(tree)) {
    for (const child of tree) { const found = walk(child, predicate); if (found) return found; }
    return null;
  }
  if (predicate(tree)) return tree;
  return walk(tree.props?.children, predicate);
}

test("project sign-in button renders AuthPage with next query, then returns to new project", async () => {
  const { browser, renderApp, CreateProjectPage, AuthPage } = makeHarness();
  const first = renderApp();
  assert.equal(first.type, "CreateProjectPage");

  const createTree = CreateProjectPage({ onNavigate: first.props.onNavigate });
  const signIn = walk(createTree, (node) => node.type === "button" &&
    String(node.props.children).includes("Sign in or create an account"));
  assert.ok(signIn, "must expose the real project-creation sign-in button");
  await signIn.props.onClick();

  assert.equal(browser.location.pathname, "/auth");
  assert.equal(browser.location.search, "?next=/projects/new");
  const routed = renderApp();
  assert.equal(routed.type, "AuthPage", "query string must not send the user to Dashboard");

  const authTree = AuthPage({ onNavigate: routed.props.onNavigate });
  const form = walk(authTree, (node) => node.type === "form" && typeof node.props.onSubmit === "function");
  assert.ok(form);
  await form.props.onSubmit({ preventDefault() {} });
  assert.equal(browser.location.pathname, "/projects/new");
  assert.equal(browser.location.search, "");
  assert.equal(renderApp().type, "CreateProjectPage");
});

test("direct /auth?next path and other existing routes retain correct component matching", () => {
  for (const [route, expected] of [
    ["/auth?next=/projects/new", "AuthPage"],
    ["/auth", "AuthPage"],
    ["/projects/new", "CreateProjectPage"],
    ["/projects/123/song", "SongPage"],
    ["/projects/123/world", "WorldPage"],
    ["/", "DashboardPage"],
  ]) {
    const { renderApp } = makeHarness(route);
    assert.equal(renderApp().type, expected, route);
  }
});
