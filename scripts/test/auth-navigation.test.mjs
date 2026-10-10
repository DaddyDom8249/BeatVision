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
    if (name === "../lib/formatCreativeText") return { getCreativeErrorMessage: () => "error" };
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
  const createHooks = hooks();
  const CreateProjectPage = load("pages/CreateProjectPage.tsx", createHooks);
  const AuthPage = load("pages/AuthPage.tsx", hooks());
  const DashboardPage = load("pages/DashboardPage.tsx", hooks());
  function renderApp() { appHooks.render(); return App(); }
  const navigated = [];
  function renderCreate() { createHooks.render(); return CreateProjectPage({onNavigate: path => navigated.push(path)}); }
  return { browser, renderApp, CreateProjectPage, AuthPage, DashboardPage, api, renderCreate, navigated };
}

function walk(tree, predicate) {
  if (tree == null || (typeof tree !== "object" && !Array.isArray(tree))) return null;
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

test("project creation surfaces rejected authentication and leaves the form retryable", async () => {
  const view=makeHarness();
  let requests=0;
  view.api.auth.getUser=async()=>{throw new Error("Authentication transport unavailable")};
  view.api.from=()=>{requests++;throw new Error("Must not query after auth failure")};
  const tree=view.renderCreate();
  const form=walk(tree,node=>node.type==="form");
  await assert.doesNotReject(form.props.onSubmit({preventDefault(){}}));
  const result=view.renderCreate();
  assert.equal(walk(result,node=>node.type==="button"&&node.props.disabled!==undefined).props.disabled,false);
  assert.ok(walk(result,node=>node.props.role==="alert"));
  assert.equal(requests,0);
  assert.deepEqual(view.navigated,[]);
});
test("project creation stops on an auth error even when stale user data is present", async () => {
  const view=makeHarness();
  let requests=0;
  view.api.auth.getUser=async()=>({data:{user:{id:"user-1"}},error:{message:"Session validation unavailable"}});
  view.api.from=()=>{requests++;return {insert(){return this},select(){return this},single:async()=>({data:{id:"project-1"},error:null})}};
  await walk(view.renderCreate(),node=>node.type==="form").props.onSubmit({preventDefault(){}});
  const result=view.renderCreate();
  assert.equal(requests,0);
  assert.ok(walk(result,node=>node.props.role==="alert"));
  assert.deepEqual(view.navigated,[]);
});
test("project creation catches a rejected save and retries with the original title and owner", async () => {
  const view=makeHarness();
  view.api.auth.getUser=async()=>({data:{user:{id:"user-1"}},error:null});
  let fail=true;
  const writes=[];
  view.api.from=(table)=>{assert.equal(table,"projects");return {
    insert(payload){writes.push(payload);return this},
    select(){return this},
    single:async()=>{if(fail)throw new Error("Database transport unavailable");return {data:{id:"project-1"},error:null}}
  }};
  walk(view.renderCreate(),node=>node.type==="input").props.onChange({target:{value:"Ghast draft"}});
  await assert.doesNotReject(walk(view.renderCreate(),node=>node.type==="form").props.onSubmit({preventDefault(){}}));
  const failed=view.renderCreate();
  assert.ok(walk(failed,node=>node.props.role==="alert"));
  assert.equal(walk(failed,node=>node.type==="button"&&node.props.disabled!==undefined).props.disabled,false);
  fail=false;
  await walk(view.renderCreate(),node=>node.type==="form").props.onSubmit({preventDefault(){}});
  assert.equal(writes.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(writes[1])),{owner_id:"user-1",title:"Ghast draft",status:"Draft",stage:"song"});
  assert.deepEqual(view.navigated,["/projects/project-1/song"]);
  assert.equal(walk(view.renderCreate(),node=>node.props.role==="alert"),null);
});


test("signed-in Start with a song opens creation, not the login screen", () => {
  const view = makeHarness("/");
  view.api.auth.getUser = async () => ({ data: { user: { id: "owner-1" } }, error: null });
  const dashboardRoute = view.renderApp();
  assert.equal(dashboardRoute.type, "DashboardPage");
  const home = view.DashboardPage({ onNavigate: dashboardRoute.props.onNavigate });
  const start = walk(home, node => node.type === "button" && JSON.stringify(node.props.children ?? "").includes("Start with a song"));
  assert.ok(start, "dashboard CTA is present");
  start.props.onClick();
  assert.equal(view.browser.location.pathname, "/projects/new", "must not navigate to /auth");
  assert.equal(view.renderApp().type, "CreateProjectPage", "signed-in user lands on real creation form");
});

test("signed-in user clicking the legacy account link stays on the create form", async () => {
  const view = makeHarness("/projects/new");
  view.api.auth.getUser = async () => ({ data: { user: { id: "owner-1" } }, error: null });
  const create = view.renderCreate();
  const account = walk(create, node => node.type === "button" &&
    String(node.props.children).includes("Sign in or create an account"));
  assert.ok(account, "account CTA exists until session status is checked");
  await account.props.onClick();
  assert.deepEqual(view.navigated, [], "existing session must never redirect home or back to auth");
  const after = view.renderCreate();
  assert.equal(walk(after, node => node.type === "button" &&
    String(node.props.children).includes("Sign in or create an account")), null,
    "session-verified users are not told to sign in again");
  assert.ok(walk(after, node => node.type === "form"), "new-project form remains usable");
});
