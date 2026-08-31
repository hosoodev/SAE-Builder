import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function write(root: string, relative: string, contents: string): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

async function fixture(): Promise<string> {
  const temporaryRoot = path.join(packageRoot, ".test-tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, "dev-"));
  await write(root, "builder.config.mjs", `export default {
    site: {
      name: "Dev Fixture",
      url: "https://example.test",
      language: "en-US",
      defaultLocale: "en",
      locales: ["en"]
    },
    build: { trailingSlash: false },
    seo: { sitemap: false, rss: false, robots: false, jsonLd: false },
    og: { enabled: false }
  };\n`);
  await write(root, "templates/layouts/default.html", `<!doctype html>
<html lang="{{lang}}"><head>{{{head}}}</head><body><main>{{{content}}}</main></body></html>\n`);
  await write(root, "content/index.md", `---
title: "Dev fixture home page"
description: "A sufficiently descriptive summary for the development server fixture."
slug: "/"
locale: "en"
---
# Initial page

[About](/about)
`);
  await write(root, "content/about.md", [
    "---",
    'title: "About the dev fixture"',
    'description: "A sufficiently descriptive summary for the clean URL development fixture."',
    'slug: "/about"',
    'locale: "en"',
    "---",
    "# About page",
    "",
  ].join("\n"));
  return root;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
  return port;
}

interface RunningCli {
  readonly child: ChildProcessWithoutNullStreams;
  stdout: string;
  stderr: string;
}

function runDev(root: string, port: number): RunningCli {
  const tsxLoader = import.meta.resolve("tsx");
  const cli = path.join(packageRoot, "src/cli/index.ts");
  const running: RunningCli = {
    child: spawn(process.execPath, [
      "--import",
      tsxLoader,
      cli,
      "dev",
      "--root",
      root,
      "--port",
      String(port),
    ], {
      cwd: packageRoot,
      stdio: ["pipe", "pipe", "pipe"],
    }),
    stdout: "",
    stderr: "",
  };
  running.child.stdout.setEncoding("utf8").on("data", chunk => {
    running.stdout += String(chunk);
  });
  running.child.stderr.setEncoding("utf8").on("data", chunk => {
    running.stderr += String(chunk);
  });
  return running;
}

async function waitForOutput(
  running: RunningCli,
  stream: "stdout" | "stderr",
  pattern: RegExp,
  timeoutMs = 20_000,
): Promise<void> {
  if (pattern.test(running[stream])) return;
  await new Promise<void>((resolve, reject) => {
    const output = running.child[stream];
    const cleanup = (): void => {
      clearTimeout(timer);
      output.off("data", onData);
      running.child.off("close", onClose);
    };
    const onData = (): void => {
      if (!pattern.test(running[stream])) return;
      cleanup();
      resolve();
    };
    const onClose = (code: number | null): void => {
      cleanup();
      reject(new Error(
        `sae dev exited with ${String(code)} before ${String(pattern)}\n` +
        `stdout:\n${running.stdout}\nstderr:\n${running.stderr}`,
      ));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(
        `Timed out waiting for ${String(pattern)}\n` +
        `stdout:\n${running.stdout}\nstderr:\n${running.stderr}`,
      ));
    }, timeoutMs);
    output.on("data", onData);
    running.child.once("close", onClose);
  });
}

async function stop(running: RunningCli): Promise<void> {
  if (running.child.exitCode !== null || running.child.signalCode !== null) return;
  const closed = new Promise<void>(resolve => running.child.once("close", () => resolve()));
  running.child.kill("SIGTERM");
  await Promise.race([
    closed,
    new Promise<void>(resolve => setTimeout(resolve, 5_000)),
  ]);
  if (running.child.exitCode === null && running.child.signalCode === null) {
    running.child.kill();
    await closed;
  }
}

test("dev logs startup, privacy-safe requests, and incremental rebuilds", async () => {
  const root = await fixture();
  const port = await availablePort();
  const running = runDev(root, port);

  try {
    await waitForOutput(running, "stdout", /\[sae\] Watching for changes/u);
    assert.match(running.stdout, /\[sae\] Built: 2 page\(s\).*2 rendered, 0 reused/u);
    assert.match(running.stdout, new RegExp(`\\[sae\\] Local: http://localhost:${port}`, "u"));

    const privateQuery = "private-address-123";
    const home = await fetch(`http://127.0.0.1:${port}/?keyword=${privateQuery}`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Initial page/u);
    await waitForOutput(running, "stdout", /\[sae\] GET \/ 200 \d+ms/u);
    assert.equal(running.stdout.includes(privateQuery), false);
    assert.equal(running.stdout.includes("keyword="), false);

    await mkdir(path.join(root, "dist/about"), { recursive: true });
    const cleanUrl = await fetch("http://127.0.0.1:" + port + "/about");
    assert.equal(cleanUrl.status, 200);
    assert.match(await cleanUrl.text(), /About page/u);

    const missing = await fetch(`http://127.0.0.1:${port}/missing/?keyword=${privateQuery}`);
    assert.equal(missing.status, 404);
    await waitForOutput(running, "stdout", /\[sae\] GET \/missing\/ 404 \d+ms/u);

    await write(root, "content/index.md", `---
title: "Updated dev fixture page"
description: "A sufficiently descriptive summary for the updated development fixture."
slug: "/"
locale: "en"
---
# Updated page

[About](/about)
`);
    await waitForOutput(running, "stdout", /\[sae\] Changed: content\/index\.md/u);
    await waitForOutput(running, "stdout", /\[sae\] Rebuilding\.\.\./u);
    await waitForOutput(running, "stdout", /\[sae\] Rebuilt: 2 page\(s\).*1 rendered, 1 reused/u);

    const updated = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(updated.status, 200);
    assert.match(await updated.text(), /Updated page/u);
    assert.equal(running.stderr, "");
  } finally {
    await stop(running);
    await rm(root, { recursive: true, force: true });
  }
});
