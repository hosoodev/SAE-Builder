import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { hashDirectory, parseBenchmarkArgs } from "../../benchmarks/run.js";

test("benchmark arguments use deterministic defaults and CLI precedence", () => {
  assert.deepEqual(parseBenchmarkArgs([], {}), {
    pageCounts: [100, 1_000],
    requireIncrementalMtimes: false,
  });
  assert.deepEqual(parseBenchmarkArgs(["--", "--pages", "20,5,20"], {
    SAE_BENCH_PAGES: "99",
    SAE_BENCH_REQUIRE_INCREMENTAL_MTIMES: "true",
  }), {
    pageCounts: [5, 20],
    requireIncrementalMtimes: true,
  });
  assert.deepEqual(parseBenchmarkArgs(["--include-10000"], { SAE_BENCH_PAGES: "10" }), {
    pageCounts: [10, 10_000],
    requireIncrementalMtimes: false,
  });
});

test("benchmark arguments reject unknown and unsafe page counts", () => {
  assert.throws(() => parseBenchmarkArgs(["--wat"], {}), /Unknown benchmark argument/);
  assert.throws(() => parseBenchmarkArgs(["--pages=0"], {}), /integers from 1 through 10000/);
  assert.throws(() => parseBenchmarkArgs([], { SAE_BENCH_PAGES: "10001" }), /integers from 1 through 10000/);
});

test("directory hashing is stable, sorted, and content-sensitive", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sae-benchmark-hash-test-"));
  try {
    await mkdir(path.join(root, "nested"));
    await writeFile(path.join(root, "z.txt"), "last", "utf8");
    await writeFile(path.join(root, "nested", "a.txt"), "first", "utf8");

    const first = await hashDirectory(root);
    const repeated = await hashDirectory(root);
    assert.equal(repeated.hash, first.hash);
    assert.deepEqual([...first.files.keys()], ["nested/a.txt", "z.txt"]);
    assert.equal(first.fileCount, 2);
    assert.equal(first.totalBytes, 9);

    await writeFile(path.join(root, "nested", "a.txt"), "changed", "utf8");
    const changed = await hashDirectory(root);
    assert.notEqual(changed.hash, first.hash);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
