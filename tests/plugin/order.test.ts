import assert from "node:assert/strict";
import test from "node:test";
import { orderPlugins } from "../../src/plugin/index.js";

test("plugins are ordered pre, normal, post and remain stable", () => {
  const ordered = orderPlugins([
    { name: "normal-a" },
    { name: "post", enforce: "post" },
    { name: "pre", enforce: "pre" },
    { name: "normal-b" },
  ]);
  assert.deepEqual(ordered.map(({ name }) => name), [
    "pre",
    "normal-a",
    "normal-b",
    "post",
  ]);
});

test("duplicate plugin names fail", () => {
  assert.throws(
    () => orderPlugins([{ name: "same" }, { name: "same" }]),
    /Duplicate plugin name/,
  );
});
