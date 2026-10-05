import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migrationPath =
  new URL("../../supabase/migrations/20261004170000_reconcile_generation_enqueue_security.sql", import.meta.url);

const migration = fs.readFileSync(migrationPath, "utf8");

test("generation enqueue RPC is security-definer hardened", () => {
  assert.match(
    migration,
    /security definer/i,
    "enqueue RPC must run with its controlled owner privileges"
  );
  assert.match(
    migration,
    /set search_path = public, pg_temp/i,
    "SECURITY DEFINER function must use a hardened search_path"
  );
});

test("generation enqueue RPC explicitly enforces project ownership", () => {
  assert.match(
    migration,
    /p\.owner_id\s*=\s*auth\.uid\(\)/i,
    "RPC must verify the caller owns the target project"
  );
  assert.match(
    migration,
    /PROJECT_FORBIDDEN/i,
    "ownership failure must have an explicit denial path"
  );
});

test("generation enqueue RPC has an authenticated-only execution surface", () => {
  assert.match(
    migration,
    /revoke all[\s\S]*?on function public\.enqueue_scene_generation\(uuid, uuid, text\)[\s\S]*?from public/i,
    "PUBLIC execution must be revoked"
  );
  assert.match(
    migration,
    /revoke all[\s\S]*?on function public\.enqueue_scene_generation\(uuid, uuid, text\)[\s\S]*?from anon/i,
    "anon execution must be revoked"
  );
  assert.match(
    migration,
    /grant execute[\s\S]*?on function public\.enqueue_scene_generation\(uuid, uuid, text\)[\s\S]*?to authenticated/i,
    "authenticated execution must be granted"
  );
});

test("generation_jobs direct client writes remain denied", () => {
  assert.match(
    migration,
    /revoke insert, update, delete[\s\S]*?on public\.generation_jobs[\s\S]*?from anon, authenticated/i,
    "clients must not receive direct generation_jobs write privileges"
  );
});
