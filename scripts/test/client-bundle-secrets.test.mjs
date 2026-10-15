// Hardening 2026-10-14: no server secrets in client source/bundle; security headers present.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const FORBIDDEN = [/SERVICE_ROLE/i, /service_role/, /sb_secret_[A-Za-z0-9_-]{10,}/, /GROQ_API_KEY/, /HF_VIDEO_TOKEN/, /ARENA_[A-Z_]*TOKEN/, /OPENROUTER_API_KEY/, /SHOTSTACK/i, /\bhf_[A-Za-z0-9]{30,}/, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/];

test("client source never references server-only secrets", () => {
  for (const file of walk(join(root, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const re of FORBIDDEN) assert.ok(!re.test(text), `${file} matches ${re}`);
  }
});
test("only VITE_SUPABASE_*/VITE_POSTHOG_* env vars are exposed to the client", () => {
  for (const file of walk(join(root, "src"))) {
    for (const m of readFileSync(file, "utf8").matchAll(/VITE_[A-Z_]+/g)) assert.match(m[0], /^VITE_(SUPABASE_(URL|ANON_KEY|PUBLISHABLE_KEY)|POSTHOG_(KEY|HOST))$/, file);
  }
});
test("built bundle (when present) contains no server secrets", { skip: !existsSync(join(root, "dist/assets")) && "no dist build" }, () => {
  for (const file of walk(join(root, "dist/assets")).filter((f) => f.endsWith(".js"))) {
    const text = readFileSync(file, "utf8");
    for (const re of FORBIDDEN.filter((r) => !/SHOTSTACK/.test(String(r)))) assert.ok(!re.test(text), `${file} matches ${re}`);
  }
});
test("vercel.json sets anti-clickjacking and nosniff headers", () => {
  const cfg = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  const h = Object.fromEntries(cfg.headers.flatMap((r) => r.headers).map((x) => [x.key.toLowerCase(), x.value]));
  assert.equal(h["x-content-type-options"], "nosniff");
  assert.equal(h["x-frame-options"], "DENY");
  assert.match(h["content-security-policy"], /frame-ancestors 'none'/);
});
