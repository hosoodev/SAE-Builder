import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { inspect } from "../../src/inspect/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function write(root: string, relative: string, contents: string): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

async function fixture(): Promise<string> {
  const temporaryRoot = path.join(packageRoot, ".test-tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, "inspect-"));
  await write(root, "builder.config.mjs", `export default {
    site: {
      name: "Inspect Fixture",
      url: "https://example.test/base/",
      language: "en-US",
      defaultLocale: "en",
      locales: ["en"]
    },
    seo: { sitemap: false, rss: false, robots: false, jsonLd: true }
  };\n`);
  await write(root, "templates/layouts/default.html", `<!doctype html>
<html lang="{{lang}}"><head>{{{head}}}</head><body>{{> header}}<main>{{{content}}}</main></body></html>\n`);
  await write(root, "templates/partials/header.html", `<header><a href="/base">Home</a></header>\n`);
  await write(root, "content/index.md", `---
title: "Inspect fixture home page"
description: "A sufficiently descriptive summary for the inspect integration fixture page."
slug: "/"
locale: "en"
---
# Inspect fixture

This page verifies the non-writing inspect path and its deterministic report.
`);
  return root;
}

interface CliResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

async function runCli(args: readonly string[]): Promise<CliResult> {
  const tsxLoader = import.meta.resolve("tsx");
  const cli = path.join(packageRoot, "src/cli/index.ts");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", tsxLoader, cli, ...args], {
      cwd: packageRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += String(chunk); });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("close", code => resolve({ code, stdout, stderr }));
  });
}

test("public and CLI inspect run a non-writing check and emit deterministic JSON", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const report = await inspect("https://example.test/base", { root });
  assert.equal(report.route, "/");
  assert.equal(report.layout, "default");
  assert.deepEqual(report.partials, ["header"]);
  assert.equal(report.canonical, "https://example.test/base/");
  assert.equal(report.locale, "en");
  await assert.rejects(stat(path.join(root, "dist")), (error: unknown) =>
    (error as NodeJS.ErrnoException).code === "ENOENT");

  const cli = await runCli([
    "inspect",
    "/",
    "--root",
    root,
    "--config",
    "builder.config.mjs",
  ]);
  assert.equal(cli.code, 0, cli.stderr);
  assert.equal(cli.stderr, "");
  assert.deepEqual(JSON.parse(cli.stdout), report);

  const missing = await runCli(["inspect", "/missing", "--root", root]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /\[INSPECT_NOT_FOUND\].*\/missing/u);
});
