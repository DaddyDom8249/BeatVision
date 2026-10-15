// Hardening 2026-10-14: temp UI-test harness folders must never be committed.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

test(".ui-test-* temp folders are gitignored and none are tracked", () => {
  const ignore = readFileSync(new URL("../../.gitignore", import.meta.url), "utf8");
  assert.match(ignore, /^\.ui-test-\*\/$/m);
  const tracked = execFileSync("git", ["ls-files"], { cwd: new URL("../../", import.meta.url), encoding: "utf8" }).split("\n");
  assert.deepEqual(tracked.filter((f) => /(^|\/)\.ui-test-/.test(f)), []);
});
