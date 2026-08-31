import assert from "node:assert/strict";
import test from "node:test";
import { DependencyGraph } from "../../src/build/index.js";

test("dependency graph invalidates reverse dependents only", () => {
  const graph = new DependencyGraph();
  graph.addDependency("output:/a/", "content:a");
  graph.addDependency("output:/a/", "layout:guide");
  graph.addDependency("output:/b/", "content:b");
  graph.addDependency("output:/b/", "layout:guide");

  assert.deepEqual(
    [...graph.affectedBy(["content:a"])].sort(),
    ["content:a", "output:/a/"],
  );
  assert.deepEqual(
    [...graph.affectedBy(["layout:guide"])].sort(),
    ["layout:guide", "output:/a/", "output:/b/"],
  );
});

test("dependency graph serialization is stable", () => {
  const first = new DependencyGraph();
  first.addDependency("z", "b");
  first.addDependency("z", "a");
  const second = new DependencyGraph();
  second.addDependency("z", "a");
  second.addDependency("z", "b");
  assert.deepEqual(first.serialize(), second.serialize());
});
