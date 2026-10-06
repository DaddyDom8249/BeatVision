import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const read = (path) => readFile(fileURLToPath(new URL("../../" + path, import.meta.url)), "utf8");

test("P0-C creates a database-authoritative current World lineage guard", async () => {
  const sql = await read("supabase/migrations/20261006090000_phase3_approval_authority.sql");
  assert.match(sql, /create or replace function public\.require_current_confirmed_world_reference/);
  assert.match(sql, /v_project\.world_report_id is distinct from new\.world_report_id/);
  assert.match(sql, /v_project\.world_confirmed_at is null/);
  assert.match(sql, /world_reports wr/);
  assert.match(sql, /wr\.confirmed_at is not null/);
  assert.match(sql, /create trigger .*_current_world_guard/);
});

test("P0-C makes approval one-way and approved_at database-owned", async () => {
  const sql = await read("supabase/migrations/20261006090000_phase3_approval_authority.sql");
  assert.match(sql, /old\.status = 'approved'/);
  assert.match(sql, /APPROVED_RECORD_IMMUTABLE/);
  assert.match(sql, /old\.status = 'draft' and new\.status = 'approved'/);
  assert.match(sql, /new\.approved_at is distinct from old\.approved_at/);
  assert.match(sql, /new\.approved_at := now\(\)/);
});

test("P0-C applies lifecycle guards to every Phase 3 creative table", async () => {
  const sql = await read("supabase/migrations/20261006090000_phase3_approval_authority.sql");
  for (const table of ["style_bibles","characters","character_assets","environments","environment_assets"]) {
    assert.match(sql, new RegExp(table + "_current_world_guard"));
    assert.match(sql, new RegExp(table + "_approval_transition_guard"));
    assert.match(sql, new RegExp(table + "_approved_delete_guard"));
  }
});

test("P0-C does not weaken existing RLS or grant browser delete access", async () => {
  const sql = await read("supabase/migrations/20261006090000_phase3_approval_authority.sql");
  assert.doesNotMatch(sql, /grant .*delete .*style_bibles/i);
  assert.doesNotMatch(sql, /grant .*delete .*characters/i);
  assert.doesNotMatch(sql, /grant .*delete .*character_assets/i);
  assert.doesNotMatch(sql, /grant .*delete .*environments/i);
  assert.doesNotMatch(sql, /grant .*delete .*environment_assets/i);
});
