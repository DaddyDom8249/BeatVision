import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const edge = readFileSync(new URL("supabase/functions/beatvision-free-motion-pilot/index.ts", root),"utf8");
const ui = readFileSync(new URL("src/pages/ProductionWorkspacePage.tsx", root),"utf8");
test("Explicit bearer auth and project ownership checks remain enforced",()=>{
  assert.match(edge,/if\(!auth\.startsWith\("Bearer "\)\)/);
  assert.match(edge,/access\.auth\.getUser\(auth\.slice\(7\)\)/);
  assert.match(edge,/\.eq\("owner_id",identity\.data\.user\.id\)/);
});
test("Missing Arena secret names cannot be disclosed before user verification",()=>{
  assert.ok(edge.indexOf("identity.data.user?.id") < edge.indexOf('const missing=['));
  assert.ok(edge.indexOf("identity.data.user?.id") < edge.indexOf('let arenaURL:URL;'));
});
test("AI pilot errors show Edge response detail for start and poll",()=>{
  assert.match(ui,/async function motionPilotErrorMessage/);
  assert.match(ui,/await context\.json\(\)/);
  assert.equal((ui.match(/throw new Error\(await motionPilotErrorMessage\(result\.error\)\)/g)||[]).length,2);
});
test("Preview never approves media or attempts a paid fallback",()=>{
  assert.doesNotMatch(edge,/\.insert\(|\.upsert\(|\.update\(/);
  assert.match(ui,/data\?\.status !== "submitted"/);
  assert.match(edge,/approved:false/);
});
