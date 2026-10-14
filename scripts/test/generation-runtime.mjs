import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadGeneration(client = {}, envVars = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'bv-runtime-'));
  const original = globalThis.Deno;
  let handler;
  globalThis.__generationTestClient = client;
  globalThis.Deno = { env: { get: name => envVars[name] || '' }, serve: fn => { handler = fn; } };
  try {
    await writeFile(join(dir, 'stub.mjs'), 'const client = globalThis.__generationTestClient; export const createClient = () => client;');
    const source = await readFile(new URL('../../supabase/functions/beatvision-generation/index.ts', import.meta.url), 'utf8');
    await writeFile(join(dir, 'model-catalog.ts'), await readFile(new URL('../../supabase/functions/_shared/model-catalog.ts', import.meta.url), 'utf8'));
    await writeFile(join(dir, 'function.ts'), source
      .replace('import "jsr:@supabase/functions-js/edge-runtime.d.ts";', '')
      .replace('from "https://esm.sh/@supabase/supabase-js@2"', 'from "./stub.mjs"')
      .replace('from "../_shared/model-catalog.ts"', 'from "./model-catalog.ts"')
      + '\nexport { terminalState, persistMotionClip, persistSceneImage, persistFinalVideo, poll, run, setFailed, resolveApprovedModel, bridgePayload };\n');
    const module = await import(pathToFileURL(join(dir, 'function.ts')).href);
    return { ...module, handler, cleanup: async () => { globalThis.Deno = original; delete globalThis.__generationTestClient; await rm(dir, { recursive: true, force: true }); } };
  } catch (error) { globalThis.Deno = original; await rm(dir, { recursive: true, force: true }); throw error; }
}
