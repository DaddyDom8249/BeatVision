import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadGeneration(client = {}, envVars = {}, sourceOverride) {
  const dir = await mkdtemp(join(tmpdir(), 'bv-runtime-'));
  const original = globalThis.Deno;
  let handler;
  globalThis.__generationTestClient = client;
  globalThis.Deno = { env: { get: key => envVars[key] ?? '' }, serve: fn => { handler = fn; } };
  try {
    await writeFile(join(dir, 'stub.mjs'), 'const client = globalThis.__generationTestClient; export const createClient = () => client;');
    await writeFile(join(dir, 'hf-motion.ts'), await readFile(new URL('../../supabase/functions/beatvision-generation/hf-motion.ts', import.meta.url), 'utf8'));
    await writeFile(join(dir, 'modal-motion.ts'), await readFile(new URL('../../supabase/functions/beatvision-generation/modal-motion.ts', import.meta.url), 'utf8'));
    await writeFile(join(dir, 'image-media.ts'), (await readFile(new URL('../../supabase/functions/beatvision-generation/image-media.ts', import.meta.url), 'utf8')).replace('npm:jpeg-js@0.4.4', new URL('../../node_modules/jpeg-js/index.js', import.meta.url).href).replace('npm:pngjs@7.0.0', new URL('../../node_modules/pngjs/lib/png.js', import.meta.url).href));
    await writeFile(join(dir, 'final-media.ts'), await readFile(new URL('../../supabase/functions/beatvision-generation/final-media.ts', import.meta.url), 'utf8'));
    const source = await readFile(sourceOverride || new URL('../../supabase/functions/beatvision-generation/index.ts', import.meta.url), 'utf8');
    await writeFile(join(dir, 'function.ts'), source
      .replace('import "jsr:@supabase/functions-js/edge-runtime.d.ts";', '')
      .replace('from "https://esm.sh/@supabase/supabase-js@2"', 'from "./stub.mjs"')
      + (sourceOverride ? '\nexport { enqueueHfMotion };\n'
        : '\nexport { validateImage, inspectApprovedImage, terminalState, persistMotionClip, persistSceneImage, assertVerifiedFreeSceneImageResponse, persistFinalVideo, poll, run, setFailed, enqueueHfMotion, hfBridgeSubmit, hfBridgePoll, motionUrl, authenticate, arenaBase, arena };\n'));
    const module = await import(pathToFileURL(join(dir, 'function.ts')).href);
    return { ...module, handler, cleanup: async () => { globalThis.Deno = original; delete globalThis.__generationTestClient; await rm(dir, { recursive: true, force: true }); } };
  } catch (error) { globalThis.Deno = original; await rm(dir, { recursive: true, force: true }); throw error; }
}
