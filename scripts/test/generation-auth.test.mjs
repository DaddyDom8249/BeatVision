import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const controllerPath = new URL(
  "../../supabase/functions/beatvision-generation/index.ts",
  import.meta.url
);
const controller = fs.readFileSync(controllerPath, "utf8");

test("generation controller uses the correct Bearer authorization regex", () => {
  assert.match(
    controller,
    /\/\^Bearer\\s\+\\S\+\$\/i/,
    "controller must accept standard Bearer tokens with whitespace between scheme and token"
  );
  assert.doesNotMatch(
    controller,
    /\/\^Bearer\\\\s\+\\S\+\$\/i/,
    "controller must not contain the double-escaped Bearer regex defect"
  );
});

test("Bearer authorization accepts a normal JWT-style header", () => {
  const bearerPattern = /^Bearer\s+\S+$/i;
  assert.equal(bearerPattern.test("Bearer eyJhbGciOiJIUzI1NiJ9.test.signature"), true);
  assert.equal(bearerPattern.test("bearer token123"), true);
});

test("Bearer authorization rejects malformed or missing headers", () => {
  const bearerPattern = /^Bearer\s+\S+$/i;
  for (const value of ["", "Basic abc123", "Bearer", "Bearer ", "Bearer\t"]) {
    assert.equal(
      bearerPattern.test(value),
      false,
      `expected rejection for ${JSON.stringify(value)}`
    );
  }
});
