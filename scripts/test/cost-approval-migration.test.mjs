import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../../supabase/migrations/20261014120000_generation_cost_approvals.sql', import.meta.url), 'utf8');

test('migration is flagged for manual apply', () => assert.match(sql, /REQUIRES MANUAL APPLY/));

test('approvals are owner-scoped, RLS-protected and not client-writable', () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke insert, update, delete on public\.generation_cost_approvals from anon, authenticated/);
  assert.match(sql, /security definer/);
  assert.match(sql, /p\.owner_id = auth\.uid\(\)/);
  assert.match(sql, /revoke all on function public\.approve_generation_cost[^;]+from public, anon/);
});

test('approvals are append-only, single-use and expiring', () => {
  assert.match(sql, /GENERATION_COST_APPROVAL_IMMUTABLE/);
  assert.match(sql, /before update or delete on public\.generation_cost_approvals/);
  assert.match(sql, /consumed_by_job_id uuid unique/);
  assert.match(sql, /expires_at timestamptz not null default \(now\(\) \+ interval '15 minutes'\)/);
});
