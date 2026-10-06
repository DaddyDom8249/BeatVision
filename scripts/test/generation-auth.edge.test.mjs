import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(
  path.join(root, "supabase/functions/beatvision-generation/index.ts"),
  "utf8",
);

test("generation controller uses real bearer-token whitespace regex", () => {
  assert.equal(
    source.includes("/^Bearer\\s+\\S+$/i"),
    true,
    "generation auth parser must match normal Authorization: Bearer <JWT> headers",
  );
  assert.equal(
    source.includes("/^Bearer\\\\s+\\\\S+$/i"),
    false,
    "generation auth parser must not contain double-escaped \\s/\\S regex tokens",
  );
});
