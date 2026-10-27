import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
const names = ["beatvision-ai-director", "beatvision-song-interpretation",
  "beatvision-world", "beatvision-analyze-song", "beatvision-style-draft",
  "beatvision-generation"];
const output = await build({entryPoints:[join(root,"supabase/functions/_shared/studio-cors.ts")],
  platform:"neutral",format:"esm",bundle:true,write:false});
const {trustedStudioOrigin} = await import("data:text/javascript;base64," +
  Buffer.from(output.outputFiles[0].text).toString("base64"));
const production = new Set(["https://beat-vision-theta.vercel.app"]);
const preview = "https://beat-vision-kfk4sh067-beat-vision.vercel.app";
const alias = "https://beat-vision-git-feat-director-storyboard-rev-8fbf97-beat-vision.vercel.app";

test("Owner-configured exact preview origins are opt-in and production survives unset config",()=>{
  assert.equal(trustedStudioOrigin(production.values().next().value,production,""),"https://beat-vision-theta.vercel.app");
  assert.equal(trustedStudioOrigin(preview,production),null);
  assert.equal(trustedStudioOrigin(preview,production,preview),preview);
  assert.equal(trustedStudioOrigin(alias,production,preview+","+alias),alias);
  assert.equal(trustedStudioOrigin(alias,production,preview),null);
});
test("CORS admission rejects hostile/malformed origins and unsafe preview config",()=>{
  const malformed=[
    "https://evil.vercel.app","https://beat-vision-theta.vercel.app.attacker.com",
    "http://beat-vision-kfk4sh067-beat-vision.vercel.app",
    "https://beat-vision-kfk4sh067-beat-vision.vercel.app:444",
    "https://beat-vision-kfk4sh067-beat-vision.vercel.app/path",
    "https://beat-vision-kfk4sh067-beat-vision.vercel.app?foo=1",
    "https://user@beat-vision-kfk4sh067-beat-vision.vercel.app",
    "*","null","https://*.vercel.app","localhost",
  ];
  for(const candidate of malformed) {
    assert.equal(trustedStudioOrigin(candidate,production,candidate),null,candidate);
    assert.equal(trustedStudioOrigin(preview,production,preview+","+candidate),null,candidate);
  }
  assert.equal(trustedStudioOrigin(preview,production,Array(9).fill(preview).join(",")),null);
  assert.equal(trustedStudioOrigin(preview,production,preview.repeat(100)),null);
});
test("All six end-to-end generation phases import the same strict CORS rule", async()=>{
  for(const name of names){
    const source=await readFile(join(root,"supabase/functions",name,"index.ts"),"utf8");
    assert.match(source,/import \{ trustedStudioOrigin \} from "\.\.\/_shared\/studio-cors\.ts";/,name);
    assert.match(source,/trustedStudioOrigin\(origin, ALLOWED_ORIGINS, Deno\.env\.get\("BEATVISION_ALLOWED_PREVIEW_ORIGINS"\)\)/,name);
    assert.doesNotMatch(source,/ALLOWED_ORIGINS\.has\(origin\)\s*\?\s*origin\s*:\s*"https:/,name);
  }
});
