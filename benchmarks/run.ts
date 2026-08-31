import assert from "node:assert/strict";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { build, type BuildResult } from "../src/build/index.js";
import { createLogger } from "../src/core/index.js";

const DEFAULT_PAGE_COUNTS = [100, 1_000] as const;
const MAX_PAGE_COUNT = 10_000;
const FIXED_MTIME = new Date("2001-01-01T00:00:00.000Z");
const silentLogger = createLogger("silent");

export interface BenchmarkCliOptions {
  pageCounts: number[];
  requireIncrementalMtimes: boolean;
}

interface HeapMeasurement {
  elapsedMs: number;
  heapUsedBeforeBytes: number;
  heapUsedAfterBytes: number;
  heapUsedDeltaBytes: number;
  peakHeapUsedBytes: number;
}

export interface DirectoryHash {
  hash: string;
  fileCount: number;
  totalBytes: number;
  files: ReadonlyMap<string, string>;
}

interface FixtureDescription {
  root: string;
  changedSource: string;
  changedOutput: string;
  pageOutputs: string[];
}

interface BuildMeasurement extends HeapMeasurement {
  outputHash: string;
  outputFileCount: number;
  outputBytes: number;
}

function incrementalMeasurement(result: BuildResult): Record<string, number> {
  return {
    renderedPages: result.incremental.renderedPages,
    reusedPages: result.incremental.reusedPages,
    invalidatedOutputs: result.incremental.invalidatedOutputs.length,
    writtenFiles: result.incremental.writtenFiles.length,
    unchangedFiles: result.incremental.unchangedFiles.length,
    removedFiles: result.incremental.removedFiles.length,
  };
}

function parseBoolean(value: string | undefined): boolean {
  return value !== undefined && ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parsePageCounts(value: string, source: string): number[] {
  const counts = value.split(",").map((part) => {
    const trimmed = part.trim();
    const count = Number(trimmed);
    if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(count) || count < 1 || count > MAX_PAGE_COUNT) {
      throw new TypeError(`${source} page counts must be integers from 1 through ${MAX_PAGE_COUNT}.`);
    }
    return count;
  });
  if (counts.length === 0) throw new TypeError(`${source} must contain at least one page count.`);
  return [...new Set(counts)].sort((left, right) => left - right);
}

export function parseBenchmarkArgs(
  argv: readonly string[],
  env: Readonly<NodeJS.ProcessEnv> = process.env,
): BenchmarkCliOptions {
  let cliPages: string | undefined;
  let includeTenThousand = parseBoolean(env.SAE_BENCH_INCLUDE_10000);
  let requireIncrementalMtimes = parseBoolean(env.SAE_BENCH_REQUIRE_INCREMENTAL_MTIMES);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      continue;
    } else if (argument === "--pages") {
      const value = argv[index + 1];
      if (value === undefined) throw new TypeError("--pages requires a comma-separated value.");
      cliPages = value;
      index += 1;
    } else if (argument.startsWith("--pages=")) {
      cliPages = argument.slice("--pages=".length);
    } else if (argument === "--include-10000") {
      includeTenThousand = true;
    } else if (argument === "--require-incremental-mtimes") {
      requireIncrementalMtimes = true;
    } else {
      throw new TypeError(`Unknown benchmark argument: ${argument}`);
    }
  }

  const configured = cliPages ?? env.SAE_BENCH_PAGES;
  const pageCounts = configured === undefined
    ? [...DEFAULT_PAGE_COUNTS]
    : parsePageCounts(configured, cliPages === undefined ? "SAE_BENCH_PAGES" : "--pages");
  if (includeTenThousand && !pageCounts.includes(MAX_PAGE_COUNT)) pageCounts.push(MAX_PAGE_COUNT);
  pageCounts.sort((left, right) => left - right);
  return { pageCounts, requireIncrementalMtimes };
}

async function filesBelow(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name === right.name ? 0 : left.name < right.name ? -1 : 1);
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Benchmark output must not contain symlinks: ${target}`);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) files.push(target);
    }
  };
  await visit(root);
  return files;
}

export async function hashDirectory(root: string): Promise<DirectoryHash> {
  const resolvedRoot = path.resolve(root);
  const files = await filesBelow(resolvedRoot);
  const aggregate = createHash("sha256");
  const fileHashes = new Map<string, string>();
  let totalBytes = 0;

  for (const file of files) {
    const relative = path.relative(resolvedRoot, file).split(path.sep).join("/");
    const body = await readFile(file);
    const digest = createHash("sha256").update(body).digest("hex");
    fileHashes.set(relative, digest);
    totalBytes += body.byteLength;
    aggregate.update(relative);
    aggregate.update("\0");
    aggregate.update(String(body.byteLength));
    aggregate.update("\0");
    aggregate.update(body);
    aggregate.update("\0");
  }

  return {
    hash: aggregate.digest("hex"),
    fileCount: files.length,
    totalBytes,
    files: fileHashes,
  };
}

function pageId(index: number): string {
  return String(index).padStart(6, "0");
}

function pageRoute(index: number): string {
  return `/pages/${pageId(index)}/`;
}

function pageOutput(index: number): string {
  return `pages/${pageId(index)}/index.html`;
}

async function writeFixtureFiles(root: string, pageCount: number): Promise<FixtureDescription> {
  const contentPages = path.join(root, "content", "pages");
  await mkdir(contentPages, { recursive: true });
  await mkdir(path.join(root, "templates", "layouts"), { recursive: true });

  await writeFile(path.join(root, "builder.config.mjs"), `export default {
  site: {
    name: "SAE Builder Benchmark",
    url: "https://benchmark.invalid",
    language: "en-US",
    defaultLocale: "en",
    locales: ["en"]
  },
  paths: {
    content: "content",
    templates: "templates",
    public: "public",
    output: "dist",
    cache: ".builder-cache"
  },
  build: { clean: false, minifyHtml: false },
  assets: { hash: true, minify: true, styles: {}, scripts: {} },
  seo: { sitemap: true, rss: true, robots: true, jsonLd: true },
  lint: { warningsAsErrors: false },
  plugins: []
};
`, "utf8");

  await writeFile(path.join(root, "templates", "layouts", "default.html"), `<!doctype html>
<html lang="{{lang}}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">{{{head}}}</head>
<body><main>{{{content}}}</main></body>
</html>
`, "utf8");

  const firstLink = pageCount > 1 ? `[Continue to the first benchmark page](${pageRoute(1)})` : "";
  await writeFile(path.join(root, "content", "index.md"), `---
title: "SAE Builder deterministic benchmark home"
description: "A synthetic and non-personal fixture used only to measure deterministic static Builder performance."
slug: "/"
layout: "default"
locale: "en"
date: "2026-08-27"
updated: "2026-08-27"
---
# SAE Builder benchmark

This synthetic fixture contains no addresses, user records, analytics, or application logs.

## What does this benchmark measure?

It measures cold, unchanged warm, and one-content-change production builds.

${firstLink}
`, "utf8");

  const writes: Promise<void>[] = [];
  for (let index = 1; index < pageCount; index += 1) {
    const id = pageId(index);
    const nextRoute = index + 1 < pageCount ? pageRoute(index + 1) : "/";
    writes.push(writeFile(path.join(contentPages, `page-${id}.md`), `---
title: "Synthetic benchmark page ${id}"
description: "Deterministic synthetic benchmark content for measuring Builder performance without personal information."
slug: "${pageRoute(index)}"
layout: "default"
locale: "en"
date: "2026-08-27"
updated: "2026-08-27"
---
# Synthetic benchmark page ${id}

This repository-generated paragraph is stable and contains no user or address data.

## How is this page used?

It provides deterministic Markdown, metadata, routing, template, and SEO work for the benchmark.

[Next benchmark page](${nextRoute}) · [Benchmark home](/)
`, "utf8"));
    if (writes.length >= 128) await Promise.all(writes.splice(0));
  }
  await Promise.all(writes);

  const changedIndex = pageCount === 1 ? 0 : Math.max(1, Math.floor(pageCount / 2));
  return {
    root,
    changedSource: changedIndex === 0
      ? path.join(root, "content", "index.md")
      : path.join(contentPages, `page-${pageId(changedIndex)}.md`),
    changedOutput: changedIndex === 0 ? "index.html" : pageOutput(changedIndex),
    pageOutputs: ["index.html", ...Array.from(
      { length: Math.max(0, pageCount - 1) },
      (_unused, index) => pageOutput(index + 1),
    )],
  };
}

async function writeFixture(pageCount: number): Promise<FixtureDescription> {
  const root = await mkdtemp(path.join(tmpdir(), `sae-builder-benchmark-${pageCount}-`));
  try {
    return await writeFixtureFiles(root, pageCount);
  } catch (error) {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    throw error;
  }
}

async function measure<T>(operation: () => Promise<T>): Promise<{ value: T; metrics: HeapMeasurement }> {
  globalThis.gc?.();
  const heapUsedBeforeBytes = process.memoryUsage().heapUsed;
  let peakHeapUsedBytes = heapUsedBeforeBytes;
  const sample = (): void => {
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, process.memoryUsage().heapUsed);
  };
  const sampler = setInterval(sample, 5);
  const started = performance.now();

  try {
    const value = await operation();
    const elapsedMs = performance.now() - started;
    sample();
    const heapUsedAfterBytes = process.memoryUsage().heapUsed;
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, heapUsedAfterBytes);
    return {
      value,
      metrics: {
        elapsedMs: Number(elapsedMs.toFixed(3)),
        heapUsedBeforeBytes,
        heapUsedAfterBytes,
        heapUsedDeltaBytes: heapUsedAfterBytes - heapUsedBeforeBytes,
        peakHeapUsedBytes,
      },
    };
  } finally {
    clearInterval(sampler);
  }
}

function buildMeasurement(metrics: HeapMeasurement, output: DirectoryHash): BuildMeasurement {
  return {
    ...metrics,
    outputHash: output.hash,
    outputFileCount: output.fileCount,
    outputBytes: output.totalBytes,
  };
}

async function benchmarkPageCount(
  pageCount: number,
  requireIncrementalMtimes: boolean,
): Promise<Record<string, unknown>> {
  const fixture = await writeFixture(pageCount);
  try {
    const buildFixture = async (): Promise<BuildResult> =>
      build({ root: fixture.root, mode: "production", logger: silentLogger });

    const coldRun = await measure(buildFixture);
    const coldOutput = await hashDirectory(path.join(fixture.root, "dist"));
    const warmRun = await measure(buildFixture);
    const warmOutput = await hashDirectory(path.join(fixture.root, "dist"));
    assert.equal(
      warmOutput.hash,
      coldOutput.hash,
      `Unchanged warm build for ${pageCount} pages was not byte deterministic`,
    );

    const baselineMtimes = new Map<string, number>();
    for (const relative of fixture.pageOutputs) {
      const output = path.join(fixture.root, "dist", ...relative.split("/"));
      await utimes(output, FIXED_MTIME, FIXED_MTIME);
      baselineMtimes.set(relative, (await stat(output)).mtimeMs);
    }

    await appendFile(
      fixture.changedSource,
      "\nThis single deterministic sentence changes exactly one content page.\n",
      "utf8",
    );
    const changedRun = await measure(buildFixture);
    const changedOutput = await hashDirectory(path.join(fixture.root, "dist"));
    assert.notEqual(
      changedOutput.hash,
      warmOutput.hash,
      `One-content-change build for ${pageCount} pages did not change the output tree`,
    );
    assert.notEqual(
      changedOutput.files.get(fixture.changedOutput),
      warmOutput.files.get(fixture.changedOutput),
      "The selected content change did not update its page output",
    );

    let unchangedChecked = 0;
    let unchangedHashesPreserved = 0;
    let unchangedMtimesPreserved = 0;
    for (const relative of fixture.pageOutputs) {
      if (relative === fixture.changedOutput) continue;
      unchangedChecked += 1;
      if (changedOutput.files.get(relative) === warmOutput.files.get(relative)) {
        unchangedHashesPreserved += 1;
      }
      const currentMtime = (await stat(path.join(fixture.root, "dist", ...relative.split("/")))).mtimeMs;
      if (currentMtime === baselineMtimes.get(relative)) unchangedMtimesPreserved += 1;
    }
    assert.equal(
      unchangedHashesPreserved,
      unchangedChecked,
      "A single content change modified another page's bytes",
    );

    const changedMtime = (await stat(path.join(
      fixture.root,
      "dist",
      ...fixture.changedOutput.split("/"),
    ))).mtimeMs;
    const changedPageMtimeAdvanced = changedMtime > (baselineMtimes.get(fixture.changedOutput) ?? 0);
    assert.equal(changedPageMtimeAdvanced, true, "Changed page mtime was not updated");

    const mtimeStatus = unchangedChecked === 0
      ? "not-applicable"
      : unchangedMtimesPreserved === unchangedChecked
        ? "supported"
        : unchangedMtimesPreserved === 0
          ? "not-supported"
          : "partial-failure";
    if (mtimeStatus === "partial-failure") {
      throw new Error(
        `Selective output preservation was partial: ${unchangedMtimesPreserved}/${unchangedChecked} unchanged page mtimes survived`,
      );
    }
    if (requireIncrementalMtimes && mtimeStatus !== "supported") {
      throw new Error(
        `Incremental mtime preservation is required but status was ${mtimeStatus} for ${pageCount} pages`,
      );
    }

    return {
      pages: pageCount,
      cold: {
        ...buildMeasurement(coldRun.metrics, coldOutput),
        incremental: incrementalMeasurement(coldRun.value),
      },
      unchangedWarm: {
        ...buildMeasurement(warmRun.metrics, warmOutput),
        incremental: incrementalMeasurement(warmRun.value),
      },
      oneContentChange: {
        ...buildMeasurement(changedRun.metrics, changedOutput),
        incremental: incrementalMeasurement(changedRun.value),
        changedOutput: fixture.changedOutput,
        deterministicUnchangedHashes: unchangedHashesPreserved === unchangedChecked,
        changedPageMtimeAdvanced,
        unchangedPageMtimes: {
          status: mtimeStatus,
          checked: unchangedChecked,
          preserved: unchangedMtimesPreserved,
        },
      },
      verification: {
        coldWarmOutputHashesMatch: coldOutput.hash === warmOutput.hash,
        changedOutputHashDiffers: changedOutput.hash !== warmOutput.hash,
      },
    };
  } finally {
    await rm(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

export async function runBenchmark(options: BenchmarkCliOptions): Promise<Record<string, unknown>> {
  const results: Record<string, unknown>[] = [];
  for (const pageCount of options.pageCounts) {
    results.push(await benchmarkPageCount(pageCount, options.requireIncrementalMtimes));
  }
  return {
    schemaVersion: 1,
    benchmark: "@sae/builder-static-build",
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      logicalCpuCount: availableParallelism(),
    },
    options: {
      pageCounts: options.pageCounts,
      requireIncrementalMtimes: options.requireIncrementalMtimes,
    },
    results,
  };
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

if (isMainModule()) {
  runBenchmark(parseBenchmarkArgs(process.argv.slice(2)))
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    });
}
