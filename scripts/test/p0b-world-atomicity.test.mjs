import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFile(fileURLToPath(new URL("../../" + path, import.meta.url)), "utf8");

test("P0-B migration exposes only authenticated atomic World transition RPCs", async () => {
  const sql = await read("supabase/migrations/20261006080000_world_atomicity.sql");
  assert.match(sql, /create or replace function public\.confirm_world_atomic/);
  assert.match(sql, /create or replace function public\.create_world_revision_atomic/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /select \*\s+into v_project[\s\S]*for update/);
  assert.match(sql, /revoke all on function public\.confirm_world_atomic\(uuid\) from public/);
  assert.match(sql, /grant execute on function public\.confirm_world_atomic\(uuid\) to authenticated/);
  assert.match(sql, /revoke all on function public\.create_world_revision_atomic\(uuid, jsonb, jsonb\) from public/);
  assert.match(sql, /grant execute on function public\.create_world_revision_atomic\(uuid, jsonb, jsonb\) to authenticated/);
});

test("P0-B migration locks the project before calculating the next revision", async () => {
  const sql = await read("supabase/migrations/20261006080000_world_atomicity.sql");
  const lockIndex = sql.indexOf("from public.projects");
  const nextRevisionIndex = sql.indexOf("select coalesce(max(wr.revision_number)");
  assert.ok(lockIndex >= 0 && nextRevisionIndex > lockIndex);
  assert.match(sql.slice(lockIndex, nextRevisionIndex), /for update/);
});

test("P0-B migration keeps the immutable World lineage and pointer update in the same function", async () => {
  const sql = await read("supabase/migrations/20261006080000_world_atomicity.sql");
  const revisionIndex = sql.indexOf("insert into public.world_reports");
  const pointerIndex = sql.indexOf("update public.projects", revisionIndex);
  assert.ok(revisionIndex >= 0 && pointerIndex > revisionIndex);
  assert.match(sql.slice(pointerIndex, pointerIndex + 500), /world_report_id = v_revision\.id/);
  assert.match(sql.slice(pointerIndex, pointerIndex + 500), /world_confirmed_at = null/);
});
