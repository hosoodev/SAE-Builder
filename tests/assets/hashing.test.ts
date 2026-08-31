import assert from "node:assert/strict";
import test from "node:test";
import { hashContent, stableStringify } from "../../src/assets/index.js";

test("hashContent is deterministic", () => {
  assert.equal(hashContent("same"), hashContent(Buffer.from("same")));
  assert.notEqual(hashContent("same"), hashContent("different"));
});

test("stableStringify sorts object keys recursively", () => {
  assert.equal(
    stableStringify({ z: 1, nested: { b: 2, a: 1 } }),
    stableStringify({ nested: { a: 1, b: 2 }, z: 1 }),
  );
});
