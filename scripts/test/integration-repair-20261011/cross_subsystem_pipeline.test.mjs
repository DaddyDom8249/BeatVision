import { test, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import ts from "typescript";
import fs from "node:fs";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, resolve, basename } from "node:path";

// Initialize DOM environment for React components/hooks testing
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url: "http://localhost:3000" });
global.window = dom.window;
global.document = dom.window.document;

const rootDir = fileURLToPath(new URL("../../../", import.meta.url));
const dir = await mkdtemp(join(rootDir, ".cross-subsystem-test-"));

after(() => rm(dir, { recursive: true, force: true }));

async function loadTSModule(filePath, rewrites = {}) {
  const absolutePath = resolve(process.cwd(), filePath);
  let source = fs.readFileSync(absolutePath, "utf8");
  for (const [from, to] of Object.entries(rewrites)) {
    source = source.replaceAll(from, to);
  }
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;

  const fileName = basename(filePath).replace(/\.(ts|tsx)$/, ".mjs");
  const tmpPath = join(dir, fileName);
  await writeFile(tmpPath, transpiled);
  return import(pathToFileURL(tmpPath).href);
}

const { formatCreativeText, getCreativeErrorMessage } = await loadTSModule("src/lib/formatCreativeText.ts");

const { getVisualPlanErrorMessage } = await loadTSModule(
  "src/lib/visualPlanErrors.ts",
  { '"./formatCreativeText"': '"./formatCreativeText.mjs"' }
);

const { mergeGeneratedStyleDraft, pickGeneratedStyleDraft } = await loadTSModule(
  "src/lib/style/generatedStyleDraft.ts"
);

test("Integration Repair 2026-10-11: formatCreativeText handles scalar, array, and nested objects cleanly", () => {
  assert.equal(formatCreativeText("  simple string  "), "  simple string  ");
  assert.equal(formatCreativeText(["line 1", "line 2"]), "line 1\nline 2");
  assert.equal(
    formatCreativeText({ name: "Neon City", mood: "cyberpunk", tags: ["glow", "dark"] }),
    "name: Neon City\nmood: cyberpunk\ntags: glow\ndark"
  );
  assert.equal(formatCreativeText(null), "");
  assert.equal(formatCreativeText(undefined), "");
});

test("Integration Repair 2026-10-11: getVisualPlanErrorMessage extracts structured database and auth error details", () => {
  const err1 = { code: "VISION_LOCK_ENVIRONMENTS_NOT_APPROVED", message: "VISION_LOCK_ENVIRONMENTS_NOT_APPROVED" };
  const msg1 = getVisualPlanErrorMessage(err1, "Fallback");
  assert.match(msg1, /approve/i);

  const err2 = new Error("Failed to fetch");
  const msg2 = getVisualPlanErrorMessage(err2, "Fallback");
  assert.equal(msg2, "Failed to fetch");

  const err3 = { code: "ASSEMBLY_MOTION_NOT_FULLY_APPROVED", message: "Motion clips missing" };
  const msg3 = getVisualPlanErrorMessage(err3, "Fallback");
  assert.equal(msg3, "Motion clips missing");
});

test("Integration Repair 2026-10-11: mergeGeneratedStyleDraft fills missing fields without overwriting author text", () => {
  const currentSheet = {
    identity: "Ghast",
    appearance: "Dark hooded cloak with silver lining",
    wardrobe: "",
    behavior: "",
    continuity: "",
  };

  const generatedProposal = {
    appearance: "BRIGHT RED CAPE",
    wardrobe: "Cyberpunk leather jacket",
    behavior: "Silent observer",
  };

  const merged = mergeGeneratedStyleDraft(currentSheet, generatedProposal, "character");

  assert.equal(merged.identity, "Ghast");
  assert.equal(merged.appearance, "Dark hooded cloak with silver lining"); // Author text preserved!
  assert.equal(merged.wardrobe, "Cyberpunk leather jacket"); // Empty field filled!
  assert.equal(merged.behavior, "Silent observer");
});

test("Integration Repair 2026-10-11: Boundary checks for Motion -> Assembly readiness contract", () => {
  const mockScenes = [
    { scene_number: 1, id: "scene-1", title: "Intro" },
    { scene_number: 2, id: "scene-2", title: "Chorus" },
  ];

  // Case A: Missing motion for scene-2
  const motionClipsMissing = [
    { scene_id: "scene-1", approved: true, video_url: "https://example.com/clip1.mp4" },
  ];

  const checkReadiness = (scenes, clips) => {
    if (scenes.length === 0) return { ready: false, reason: "NO_SCENES" };
    const approvedClips = clips.filter(c => c.approved && c.video_url);
    const coveredScenes = new Set(approvedClips.map(c => c.scene_id));
    if (coveredScenes.size < scenes.length) return { ready: false, reason: "INCOMPLETE_MOTION_COVERAGE" };
    if (approvedClips.length > scenes.length) return { ready: false, reason: "DUPLICATE_APPROVED_MOTION" };
    return { ready: true, reason: "READY" };
  };

  assert.deepEqual(checkReadiness(mockScenes, motionClipsMissing), { ready: false, reason: "INCOMPLETE_MOTION_COVERAGE" });

  // Case B: All scenes covered with exactly 1 approved motion clip each
  const motionClipsComplete = [
    { scene_id: "scene-1", approved: true, video_url: "https://example.com/clip1.mp4" },
    { scene_id: "scene-2", approved: true, video_url: "https://example.com/clip2.mp4" },
  ];
  assert.deepEqual(checkReadiness(mockScenes, motionClipsComplete), { ready: true, reason: "READY" });

  // Case C: Duplicate approved motion clips for scene-1
  const motionClipsDuplicate = [
    { scene_id: "scene-1", approved: true, video_url: "https://example.com/clip1a.mp4" },
    { scene_id: "scene-1", approved: true, video_url: "https://example.com/clip1b.mp4" },
    { scene_id: "scene-2", approved: true, video_url: "https://example.com/clip2.mp4" },
  ];
  assert.deepEqual(checkReadiness(mockScenes, motionClipsDuplicate), { ready: false, reason: "DUPLICATE_APPROVED_MOTION" });
});
