#!/usr/bin/env node
/**
 * BeatVision master runner.
 *
 * Deterministic by design: this script never calls an LLM, image model, video
 * provider, Manus task, or paid API. It audits the repository and optionally
 * repairs only local CI scaffolding. Runtime generation remains opt-in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const ARENA = process.env.BEATVISION_ARENA_DIR || path.resolve(ROOT, '../BeatVision-arena');
const args = new Set(process.argv.slice(2));
const repair = args.has('--repair');
const skipBuild = args.has('--skip-build');
const strict = args.has('--strict');
const failures = [];
const warnings = [];
const checked = [];

function rel(p) { return path.relative(ROOT, p) || '.'; }
function exists(p) { return fs.existsSync(p); }
function text(p) { return fs.readFileSync(p, 'utf8'); }
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
  try { return execFileSync(command, commandArgs, { cwd: ROOT, encoding: 'utf8', stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' }); }
  catch (error) { if (!options.allowFailure) throw error; return null; }
}
function arenaFile(name) { return path.join(ARENA, name); }
function copyArena(name) {
  const source = arenaFile(name);
  const target = path.join(ROOT, name);
  if (!exists(source)) throw new Error(`Arena reference missing: ${name}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`REPAIR copied ${name} from BeatVision-arena`);
}

console.log(`BeatVision master runner | mode=${repair ? 'audit+repair' : 'audit'} | credits=0`);
console.log(`Repository: ${ROOT}`);
console.log(`Arena reference: ${ARENA}`);

check('repository', exists(path.join(ROOT, 'package.json')), 'package.json present');
check('cloudflare worker', exists(path.join(ROOT, 'cloudflare-ai-worker/src/index.ts')), 'current worker source present');
check('worker config', exists(path.join(ROOT, 'cloudflare-ai-worker/wrangler.toml')), 'wrangler config present');
check('worker image route', text(path.join(ROOT, 'cloudflare-ai-worker/src/index.ts')).includes('"/generate-image"'), 'Cloudflare image generation route present');
check('worker health route', text(path.join(ROOT, 'cloudflare-ai-worker/src/index.ts')).includes('"/health"'), 'health route present');
check('worker fail-closed CORS', /ALLOWED_ORIGIN/.test(text(path.join(ROOT, 'cloudflare-ai-worker/src/index.ts'))), 'explicit origin configuration present');
check('credit safe defaults', /VITE_CREDIT_SAFE_MODE/.test(text(path.join(ROOT, '.env.example'))), 'frontend safe-mode variable documented');

const workerToml = text(path.join(ROOT, 'cloudflare-ai-worker/wrangler.toml'));
check('worker has deployment name', /^name\s*=\s*"[^"]+"/m.test(workerToml), 'wrangler worker name present');
check('worker AI binding', /\[ai\]/.test(workerToml), 'Workers AI binding present');

const arenaAvailable = exists(ARENA);
check('Arena reference available', arenaAvailable, arenaAvailable ? 'comparison source available' : 'clone BeatVision-arena or set BEATVISION_ARENA_DIR');
if (arenaAvailable) {
  const arenaTests = ['tests/static-audit.mjs', 'tests/security-audit.mjs', 'tests/pipeline-coherence-audit.mjs', 'tests/termux-runner-audit.mjs', 'tests/animation-state-audit.mjs', 'tests/render-integrity.mjs'];
  for (const file of arenaTests) check(`Arena gate ${file}`, exists(arenaFile(file)), 'reference gate available');
  check('Arena validated worker', exists(arenaFile('worker/src/arena-validated-entry.ts')), 'validated entrypoint available');
  check('Arena durable animation worker', exists(arenaFile('worker/src/animation-jobs.ts')), 'durable animation job implementation available');
  warn('pipeline capability gap', 'BeatVision cloudflare-ai-worker is image-only; Arena full pipeline requires validated entry, animation jobs, and deterministic assembly before claiming parity.');
}

if (repair && arenaAvailable) {
  // Safe repair only: install deterministic audit gates and CI. No runtime provider code is copied.
  // The Arena gates are reference-only until BeatVision implements their required runtime modules.
  warn('Arena gates not transplanted', 'Skipped incompatible Arena-only tests; the master runner audits capability boundaries instead.');
  const workflow = path.join(ROOT, ".github/workflows/beatvision-master.yml");
  check("master workflow", exists(workflow), "create .github/workflows/beatvision-master.yml from the repository template if absent");
}

if (!skipBuild) {
  check('frontend build', run('pnpm', ['run', 'build'], { allowFailure: true }) !== null, 'production build');
}

const report = {
  generated_at: new Date().toISOString(),
  credits_used: 0,
  mode: repair ? 'audit+repair' : 'audit',
  repository: ROOT,
  arena_reference: ARENA,
  checks: checked,
  warnings,
  failures,
  status: failures.length ? 'FAIL' : (warnings.length ? 'PASS_WITH_WARNINGS' : 'PASS')
};
fs.mkdirSync(path.join(ROOT, 'audit-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'audit-results/master-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`REPORT audit-results/master-report.json status=${report.status}`);
if (strict && warnings.length) process.exitCode = 1;
if (failures.length) process.exitCode = 1;
