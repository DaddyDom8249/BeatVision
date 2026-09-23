#!/usr/bin/env node
/**
 * BeatVision deterministic repository audit.
 * Never calls AI providers or paid APIs. Runtime generation is never part of the audit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const ARENA = process.env.BEATVISION_ARENA_DIR || path.join(ROOT, 'worker');
const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--skip-build');
const strict = args.has('--strict');
const failures = [];
const warnings = [];
const checked = [];

const exists = (p) => fs.existsSync(p);
const text = (p) => fs.readFileSync(p, 'utf8');
function check(name, ok, detail) {
  checked.push({ name, ok, detail });
  (ok ? console.log : console.error)(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push({ name, detail });
}
function warn(name, detail) {
  warnings.push({ name, detail });
  console.warn(`WARN ${name} — ${detail}`);
}
function run(command, commandArgs, options = {}) {
  try {
    execFileSync(command, commandArgs, { cwd: options.cwd || ROOT, stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

console.log('BeatVision master audit | credits=0');
console.log(`Repository: ${ROOT}`);
console.log(`Canonical Arena worker: ${ARENA}`);

check('repository', exists(path.join(ROOT, 'package.json')), 'package.json present');
check('canonical Arena entry', exists(path.join(ARENA, 'src/arena-validated-entry.ts')), 'validated Arena entrypoint present');
check('canonical Arena config', exists(path.join(ARENA, 'wrangler.toml')), 'Arena deployment config present');
check('timeline contract', exists(path.join(ARENA, 'src/pipeline-contract.ts')), 'timeline contract lives with Arena');
check('timeline contract tests', exists(path.join(ARENA, 'src/pipeline-contract.test.ts')), 'timeline contract regression tests present');
check('animation jobs', exists(path.join(ARENA, 'src/animation-jobs.ts')), 'durable motion jobs present');
check('visual beat engine', exists(path.join(ARENA, 'src/visual-beat-engine.ts')), 'duration-aware visual beat engine present');
check('credit-safe defaults', /VITE_CREDIT_SAFE_MODE/.test(text(path.join(ROOT, '.env.example'))), 'safe mode documented');
check('obsolete image-only worker removed', !exists(path.join(ROOT, 'cloudflare-ai-worker')), 'no parallel Cloudflare image worker');

const generation = path.join(ROOT, 'supabase/functions/beatvision-generate/index.ts');
const arenaBridge = path.join(ROOT, 'supabase/functions/beatvision-arena/index.ts');
const projectPage = path.join(ROOT, 'src/pages/ProjectResultsPage.tsx');
const motionSection = path.join(ROOT, 'src/components/project/MotionClipSection.tsx');
const renderSection = path.join(ROOT, 'src/components/project/FinalVideoRenderSection.tsx');
const authHelper = path.join(ROOT, 'supabase/functions/_shared/auth.ts');

check('generation auth helper', exists(authHelper) && /requireAuthenticatedUser/.test(text(authHelper)), 'shared authenticated-user enforcement present');
check('generation project authorization', exists(generation) && /assertProjectOwner/.test(text(generation)) && /requireAuthenticatedUser/.test(text(generation)), 'language generation is bound to the signed-in project owner');
check('generation provider authority', exists(generation) && /v1\/language\/generate/.test(text(generation)) && !/INTEGRATIONS_API_KEY|gemini-2\.5|appmedo/i.test(text(generation)), 'no direct legacy Gemini provider path');
check('Arena bridge authentication', exists(arenaBridge) && /requireAuthenticatedUser/.test(text(arenaBridge)), 'Arena bridge requires an authenticated user');
check('Arena production UI', exists(projectPage) && /Arena Provider Pipeline/.test(text(projectPage)), 'project UI identifies Arena as execution authority');
check('Arena motion execution', exists(motionSection) && /arenaAnimate|arenaAnimationJob/.test(text(motionSection)) && !/Retry with Fallback|buildFallbackClipData/i.test(text(motionSection)), 'motion uses Arena jobs');
check('Arena final assembly', exists(renderSection) && /arenaAssemble/.test(text(renderSection)), 'final assembly uses Arena');
check('no hard-coded Supabase fallback', exists(path.join(ROOT, 'src/db/supabase.ts')) && !/https:\/\/mdofsinyofqbeapzfygu\.supabase\.co/.test(text(path.join(ROOT, 'src/db/supabase.ts'))), 'Supabase URL/key come from environment');
check('obsolete provider settings route removed', exists(path.join(ROOT, 'src/routes.tsx')) && !/settings\/providers/.test(text(path.join(ROOT, 'src/routes.tsx'))), 'dead global provider settings route removed');

const workerTests = [
  'src/pipeline-contract.test.ts',
  'src/storyboard-validator.test.ts',
  'src/render-integrity.test.ts',
  'src/composition-model.test.ts',
  'src/visual-reuse-detector.test.ts',
  'src/musical-structure.test.ts',
  'src/scene-splitting.test.ts',
];
for (const file of workerTests) check(`worker test ${file}`, exists(path.join(ARENA, file)), 'test present');

if (!skipBuild) {
  check('frontend typecheck', run('pnpm', ['run', 'typecheck']), 'TypeScript check');
  check('frontend build', run('pnpm', ['run', 'build']), 'production build');
  check('deterministic e2e', run('pnpm', ['run', 'test:e2e:deterministic']), 'deterministic end-to-end suite');
  check('local render contract', run('pnpm', ['run', 'test:render:local']), 'local media/timeline integrity suite');
  check('Arena worker tests', run('npm', ['test'], { cwd: ARENA }), 'Arena regression suite');
}

const report = {
  generated_at: new Date().toISOString(),
  credits_used: 0,
  repository: ROOT,
  canonical_arena_worker: ARENA,
  checks: checked,
  warnings,
  failures,
  status: failures.length ? 'FAIL' : (warnings.length ? 'PASS_WITH_WARNINGS' : 'PASS'),
};
fs.mkdirSync(path.join(ROOT, 'audit-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'audit-results/master-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`REPORT audit-results/master-report.json status=${report.status}`);
if (strict && warnings.length) process.exitCode = 1;
if (failures.length) process.exitCode = 1;
