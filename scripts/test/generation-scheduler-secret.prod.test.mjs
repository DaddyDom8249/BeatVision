import test from "node:test";
import assert from "node:assert/strict";
import { loadGeneration } from "./generation-runtime.mjs";

const SECRET = "fixture-only-queue-secret-no-provider";
const env = { SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-only-service", SUPABASE_ANON_KEY: "fixture-only-anon" };

function fixture({ configError = null } = {}) {
  const counts = { rpc: 0, auth: 0 };
  const db = {
    rpc: async (name) => {
      counts.rpc++;
      assert.equal(name, "get_generation_scheduler_secret");
      return { data: configError ? null : SECRET, error: configError ? { message: configError } : null };
    },
    auth: { getUser: async () => { counts.auth++; return { data: { user: { id: "fixture-user" } }, error: null }; } },
  };
  return { db, counts };
}

function request(secret = null, bearer = false) {
  const headers = new Headers();
  if (secret !== null) headers.set("X-BeatVision-Queue-Secret", secret);
  if (bearer) headers.set("Authorization", "Bearer valid-user-token");
  return new Request("https://fixture.supabase.co/functions/v1/beatvision-generation", { method: "POST", headers, body: "{}" });
}

test("wrong scheduler secret rejects even when bearer user token is valid", async () => {
  const { db, counts } = fixture();
  const rt = await loadGeneration(db, env);
  try {
    for (const value of ["wrong", SECRET.slice(0, -1), SECRET + "-extra", ""]) {
      await assert.rejects(rt.authenticate(request(value, true)), e => e?.status === 401 && e?.code === "UNAUTHORIZED_SCHEDULER");
    }
    assert.equal(counts.rpc, 3);
    assert.equal(counts.auth, 0);
  } finally { await rt.cleanup(); }
});

test("correct scheduler secret permits system requests", async () => {
  const { db, counts } = fixture();
  const rt = await loadGeneration(db, env);
  try {
    assert.deepEqual(await rt.authenticate(request(SECRET)), { kind: "system", userId: null });
    assert.equal(counts.rpc, 1);
    assert.equal(counts.auth, 0);
  } finally { await rt.cleanup(); }
});

test("user bearer without scheduler header retains normal user auth", async () => {
  const { db, counts } = fixture();
  const rt = await loadGeneration(db, env);
  try {
    assert.deepEqual(await rt.authenticate(request(null, true)), { kind: "user", userId: "fixture-user" });
    assert.equal(counts.rpc, 0);
    assert.equal(counts.auth, 1);
  } finally { await rt.cleanup(); }
});

test("scheduler configuration error never discloses database error text", async () => {
  const { db, counts } = fixture({ configError: "PRIVATE_DB_DETAIL_DO_NOT_DISCLOSE" });
  const rt = await loadGeneration(db, env);
  try {
    await assert.rejects(rt.authenticate(request("wrong", true)), e =>
      e?.status === 500 && e?.code === "SCHEDULER_CONFIG_FAILED" && !String(e.message).includes("PRIVATE_DB_DETAIL"));
    assert.equal(counts.auth, 0);
  } finally { await rt.cleanup(); }
});
