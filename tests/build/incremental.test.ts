import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { DependencyGraph } from "../../src/build/graph.js";
import { planInvalidation, syncOutputTree } from "../../src/build/incremental.js";

test("invalidation walks reverse dependencies to only affected outputs", () => {
  const graph = new DependencyGraph();
  graph.setFingerprint("content:a", "old-a");
  graph.setFingerprint("content:b", "same-b");
  graph.addDependency("output:/a/", "content:a");
  graph.addDependency("output:/b/", "content:b");

  const plan = planInvalidation(graph.serialize(), {
    "content:a": "new-a",
    "content:b": "same-b",
  });
  assert.deepEqual([...plan.changedNodes], ["content:a"]);
  assert.deepEqual([...plan.affectedOutputs], ["output:/a/"]);
});

test("output sync preserves unchanged mtimes and removes stale files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sae-incremental-"));
  const stage = path.join(root, "stage");
  const output = path.join(root, "dist");
  await mkdir(stage, { recursive: true });
  await writeFile(path.join(stage, "a.html"), "a1");
  await writeFile(path.join(stage, "b.html"), "b1");
  await syncOutputTree(stage, output);
  const beforeA = (await stat(path.join(output, "a.html"))).mtimeMs;
  const beforeB = (await stat(path.join(output, "b.html"))).mtimeMs;

  await new Promise((resolve) => setTimeout(resolve, 30));
  await writeFile(path.join(stage, "a.html"), "a2");
  await writeFile(path.join(output, "stale.html"), "stale");
  const result = await syncOutputTree(stage, output);

  assert.deepEqual(result.written, ["a.html"]);
  assert.deepEqual(result.unchanged, ["b.html"]);
  assert.deepEqual(result.removed, ["stale.html"]);
  assert.ok((await stat(path.join(output, "a.html"))).mtimeMs > beforeA);
  assert.equal((await stat(path.join(output, "b.html"))).mtimeMs, beforeB);
  assert.equal(await readFile(path.join(output, "a.html"), "utf8"), "a2");
});

test("output sync rejects a junction instead of writing through it", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "sae-incremental-link-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stage = path.join(root, "stage");
  const output = path.join(root, "dist");
  const outside = path.join(root, "outside");
  await mkdir(path.join(stage, "nested"), { recursive: true });
  await mkdir(output, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(stage, "nested", "sentinel.txt"), "changed");
  await writeFile(path.join(outside, "sentinel.txt"), "protected");
  try {
    await symlink(outside, path.join(output, "nested"), "junction");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      t.skip("Creating a junction is not permitted in this environment");
      return;
    }
    throw error;
  }

  await assert.rejects(syncOutputTree(stage, output), /Symbolic links are not allowed/u);
  assert.equal(await readFile(path.join(outside, "sentinel.txt"), "utf8"), "protected");
});
