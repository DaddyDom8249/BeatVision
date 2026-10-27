import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { buildModalShotPrompt, MotionDirectionError } from "../../supabase/functions/beatvision-generation/shot-direction.ts";

// Extract the real controller enqueue function. All database and provider
// dependencies are replaced by in-memory stubs; no credentials or GPU calls.
function extractEnqueue(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const start = source.indexOf("async function enqueueHfMotion(");
  const end = source.indexOf("\nasync function hfBridgeSubmit(", start);
  assert.ok(start > 0 && end > start, "controller enqueue function must exist");
  return ts.transpileModule(source.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
}

const candidate = extractEnqueue("../../supabase/functions/beatvision-generation/index.ts");
const frozenV72 = extractEnqueue("../../docs/releases/2026-10-26/runtime/beatvision-generation/index.ts");

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const MODAL_MOTION = {
  model: "Lightricks/LTX-Video-0.9.5",
  revision: "e58e28c39631af4d1468ee57a853764e11c1d37e",
  frames: 49,
  fps: 24,
};
const HF_MOTION = { space: "fixture", revision: "free-fixture", duration: 2 };

function fixture(functionCode, movementDirection) {
  const shot = {
    id: "scene-1", start_time: 0, end_time: 2,
    movement_direction: movementDirection, camera_direction: "Camera holds still.",
  };
  const calls = { inserted: [], lookups: [], gpuSubmit: [], modalCapabilities: 0 };
  const image = {
    id: "approved-image-1", storage_path: "project-1/scene-images/source.png",
    generation_job_id: "image-job-1", reused_from_image_id: null,
  };
  const template = {
    id: "image-job-1", project_id: "project-1", visual_plan_id: "plan-1",
    vision_lock_id: "lock-1", status: "completed",
    input_snapshot: { scene: shot, vision_snapshot: { approved: true } },
  };
  const db = {
    from(table) {
      const filters = {};
      let toInsert;
      return {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        order() { return this; },
        limit() { return this; },
        insert(row) { toInsert = row; calls.inserted.push({ table, row }); return this; },
        async maybeSingle() {
          calls.lookups.push({ table, filters: { ...filters } });
          if (table === "visual_plan_scenes") return {
            data: { id: "scene-1", visual_plan_id: "plan-1", status: "approved" }, error: null,
          };
          if (table === "visual_plans") return {
            data: { id: "plan-1", vision_lock_id: "lock-1", status: "approved" }, error: null,
          };
          if (table === "scene_image_assets") return { data: image, count: 1, error: null };
          if (table === "generation_jobs") return { data: null, error: null };
          throw new Error("Unexpected table: " + table);
        },
        async single() {
          calls.lookups.push({ table, filters: { ...filters } });
          assert.equal(table, "generation_jobs");
          if (toInsert) return { data: { id: "motion-job-1", status: "queued", ...toInsert }, error: null };
          assert.equal(filters.id, "image-job-1");
          return { data: template, error: null };
        },
      };
    },
    rpc() { throw new Error("Unexpected RPC"); },
  };
  const enqueue = new Function(
    "HttpError", "MotionDirectionError", "buildModalShotPrompt",
    "assertModalSubmissionEnabled", "hfEligibility", "env",
    "MODAL_MOTION", "HF_MOTION", "modalFramesForScene",
    functionCode + "\nreturn enqueueHfMotion;",
  )(
    HttpError, MotionDirectionError, buildModalShotPrompt,
    () => { calls.modalCapabilities++; },
    async () => ({ available: true }),
    () => "fixture",
    MODAL_MOTION, HF_MOTION, () => 49,
  );
  return { enqueue, db, calls };
}

test("negative control: archived deployed v72 would enqueue an ambiguous shot", async () => {
  const f = fixture(frozenV72, "Slow");
  const result = await f.enqueue(f.db, "project-1", "scene-1", true, "approved-image-1", undefined, "modal");
  assert.equal(result.status, "queued");
  assert.equal(f.calls.inserted.length, 1,
    "documents the historical flaw using only a fake in-memory database");
  assert.equal(f.calls.gpuSubmit.length, 0);
});

test("current controller rejects invalid frozen directions before job insertion", async () => {
  for (const direction of ["Slow", ["Walk", "Turn"], "", "Walk or turn toward the door"]) {
    const f = fixture(candidate, direction);
    await assert.rejects(
      f.enqueue(f.db, "project-1", "scene-1", true, "approved-image-1", undefined, "modal"),
      (error) => error instanceof HttpError && error.status === 409 &&
        error.code.startsWith("MODAL_SHOT_DIRECTION_"),
      "invalid shot must be rejected by the actual enqueue function",
    );
    assert.equal(f.calls.inserted.length, 0, "invalid request created a job");
    assert.equal(f.calls.gpuSubmit.length, 0, "invalid request submitted to GPU");
    assert.equal(f.calls.lookups.some(entry =>
      entry.table === "generation_jobs" && "idempotency_key" in entry.filters), false,
      "reject before looking up or creating a motion attempt");
  }
});

test("valid frozen single-shot action still enqueues exactly one unapproved job", async () => {
  const f = fixture(candidate, {
    actor: "The singer slowly raises a photograph toward the lantern.",
    camera: "Camera moves closer to the photograph.",
  });
  const job = await f.enqueue(f.db, "project-1", "scene-1", true, "approved-image-1", undefined, "modal");
  assert.equal(job.status, "queued");
  assert.equal(f.calls.inserted.length, 1);
  assert.equal(f.calls.inserted[0].row.job_type, "scene_motion");
  assert.equal(f.calls.inserted[0].row.input_snapshot.scene.id, "scene-1");
  assert.equal(f.calls.gpuSubmit.length, 0, "enqueue never runs inference");
});
