import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root=fileURLToPath(new URL("../../",import.meta.url));
const manifest=JSON.parse(await readFile(join(root,"docs/releases/2026-10-27/preview-cors-exact-live/manifest.json"),"utf8"));
test("Release patches six exact deployed sources by one immutable preview-origin line",async()=>{
  assert.equal(manifest.functions.length,6);
  const addition='  "'+manifest.preview_origin+'",\n';
  const anchor="const ALLOWED_ORIGINS = new Set([\n";
  for(const fn of manifest.functions){
    const before=await readFile(join(root,fn.baseline_path),"utf8");
    const after=await readFile(join(root,fn.release_path),"utf8");
    assert.ok(before.includes(anchor),fn.name);
    assert.equal(before.includes(addition),false,fn.name);
    assert.equal(after,before.replace(anchor,anchor+addition),fn.name+" exact live parity");
    const repository=await readFile(join(root,"supabase/functions",fn.name,"index.ts"),"utf8");
    assert.ok(repository.includes(anchor+addition),fn.name+" feature source aligned");
    assert.equal(typeof fn.verify_jwt,"boolean");
    assert.ok(!after.includes("https://*.vercel.app"),fn.name);
  }
});
test("Generation release uses archived live v72 source, not the divergent feature controller",async()=>{
 const gen=manifest.functions.find(x=>x.name==="beatvision-generation");
 const live=await readFile(join(root,"docs/releases/2026-10-26/runtime/beatvision-generation/index.ts"),"utf8");
 const original=await readFile(join(root,gen.baseline_path),"utf8");
 assert.equal(original,live);
});