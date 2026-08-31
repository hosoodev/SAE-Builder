#!/usr/bin/env node

import path from "node:path";
import http from "node:http";
import { watch } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import {
  build,
  check,
  clean as cleanProject,
  type BuildOptions,
  type BuildResult,
} from "../build/index.js";
import { BuilderError, loadConfig } from "../core/index.js";
import { assertInsideRoot, isInsideRoot } from "../filesystem/index.js";
import { inspect } from "../inspect/index.js";

interface CliOptions {
  command: string;
  root: string;
  configFile?: string;
  production: boolean;
  port: number;
  inspectTarget?: string;
}

const MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

function usage(): string {
  return [
    "SAE Builder",
    "",
    "Usage:",
    "  sae build [--root <path>] [--config <file>] [--production]",
    "  sae check [--root <path>] [--config <file>]",
    "  sae clean [--root <path>] [--config <file>]",
    "  sae dev [--root <path>] [--config <file>] [--port <number>]",
    "  sae inspect <url-or-route> [--root <path>] [--config <file>]  # JSON output",
  ].join("\n");
}

function parseArguments(argv: readonly string[]): CliOptions {
  const values = [...argv];
  const command = values.shift() ?? "help";
  let root = process.cwd();
  let configFile: string | undefined;
  let production = false;
  let port = Number(process.env.PORT ?? 5173);
  let inspectTarget: string | undefined;

  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--production") {
      production = true;
      continue;
    }
    if (argument === "--root" || argument === "--config" || argument === "--port") {
      const value = values[++index];
      if (!value) throw new Error(`${argument} requires a value.`);
      if (argument === "--root") root = path.resolve(value);
      if (argument === "--config") configFile = value;
      if (argument === "--port") port = Number(value);
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      return { command: "help", root, production, port };
    }
    if (command === "inspect" && !argument.startsWith("-") && inspectTarget === undefined) {
      inspectTarget = argument;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("--port must be an integer between 1 and 65535.");
  }
  if (command === "inspect" && inspectTarget === undefined) {
    throw new Error("sae inspect requires a URL or route.");
  }
  return { command, root: path.resolve(root), configFile, production, port, inspectTarget };
}

function buildOptions(options: CliOptions): BuildOptions {
  return {
    root: options.root,
    configFile: options.configFile,
    mode: options.production ? "production" : "development",
  };
}

function printResult(label: string, pageCount: number, outputRoot: string): void {
  console.log(`${label}: ${pageCount} page(s) · ${outputRoot}`);
}

function formatDuration(startedAt: number): string {
  return `${Math.max(0, Math.round(performance.now() - startedAt))}ms`;
}

function printDevBuildResult(label: string, result: BuildResult, startedAt: number): void {
  const { incremental } = result;
  console.log(
    `[sae] ${label}: ${result.pages.length} page(s) in ${formatDuration(startedAt)}` +
    ` · ${incremental.renderedPages} rendered, ${incremental.reusedPages} reused` +
    ` · ${incremental.writtenFiles.length} written, ${incremental.removedFiles.length} removed`,
  );
}

function requestPathForLog(requestUrl: string): string {
  try {
    // Deliberately omit query parameters: consumer sites can handle private user input.
    return new URL(requestUrl, "http://localhost").pathname;
  } catch {
    return "/<invalid-url>";
  }
}

function printChangedFiles(changedFiles: readonly string[]): void {
  if (changedFiles.length === 0) {
    console.log("[sae] Rebuilding");
    return;
  }
  const visible = changedFiles.slice(0, 3);
  const remainder = changedFiles.length - visible.length;
  console.log(
    `[sae] Changed: ${visible.join(", ")}${remainder > 0 ? ` (+${remainder} more)` : ""}`,
  );
}

async function clean(options: CliOptions): Promise<void> {
  const result = await cleanProject({ root: options.root, configFile: options.configFile });
  console.log(`Clean complete: ${result.root}`);
}

async function resolveStaticFile(outputRoot: string, requestUrl: string): Promise<string> {
  const request = new URL(requestUrl, "http://localhost");
  const decoded = decodeURIComponent(request.pathname);
  if (decoded.includes("\\") || decoded.split("/").includes("..")) {
    throw new Error("Unsafe request path");
  }
  const segments = decoded.split("/").filter(Boolean);
  let target = assertInsideRoot(outputRoot, path.resolve(outputRoot, ...segments));
  try {
    if ((await stat(target)).isDirectory()) {
      const directoryIndex = path.join(target, "index.html");
      try {
        await stat(directoryIndex);
        target = directoryIndex;
      } catch {
        target = decoded.endsWith("/") ? directoryIndex : target + ".html";
      }
    }
  } catch {
    if (decoded.endsWith("/")) {
      target = path.join(target, "index.html");
    } else if (path.extname(target) === "") {
      target += ".html";
    }
  }
  return assertInsideRoot(outputRoot, target);
}

async function dev(options: CliOptions): Promise<void> {
  const config = await loadConfig(options.root, options.configFile);
  const initialBuildStartedAt = performance.now();
  let result = await build({ ...buildOptions(options), mode: "development" });
  let activeBuild = false;
  let queuedBuild = false;
  let closing = false;
  let timer: NodeJS.Timeout | undefined;
  const changedFiles = new Set<string>();

  const rebuild = async (): Promise<void> => {
    if (closing) return;
    if (activeBuild) {
      queuedBuild = true;
      return;
    }
    activeBuild = true;
    const rebuildFiles = [...changedFiles].sort((left, right) => left.localeCompare(right));
    changedFiles.clear();
    printChangedFiles(rebuildFiles);
    console.log("[sae] Rebuilding...");
    const rebuildStartedAt = performance.now();
    try {
      result = await build({ ...buildOptions(options), mode: "development" });
      printDevBuildResult("Rebuilt", result, rebuildStartedAt);
    } catch (error) {
      console.error(`[sae] Rebuild failed in ${formatDuration(rebuildStartedAt)}`);
      printError(error);
    } finally {
      activeBuild = false;
      if (queuedBuild && !closing) {
        queuedBuild = false;
        await rebuild();
      }
    }
  };

  const watcher = watch(options.root, { recursive: true }, (_event, filename) => {
    const relative = filename?.toString().replaceAll("\\", "/") ?? "";
    const target = path.resolve(options.root, relative);
    if (isInsideRoot(config.resolvedPaths.output, target) || isInsideRoot(config.resolvedPaths.cache, target)) return;
    if (relative === "node_modules" || relative.startsWith("node_modules/")) return;
    changedFiles.add(relative || "<unknown>");
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), 150);
  });

  const server = http.createServer(async (request, response) => {
    const requestStartedAt = performance.now();
    try {
      const target = await resolveStaticFile(result.outputRoot, request.url ?? "/");
      const body = await readFile(target);
      response.statusCode = 200;
      response.setHeader("content-type", MIME_TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream");
      response.end(body);
    } catch {
      response.statusCode = 404;
      response.end("Not Found");
    } finally {
      console.log(
        `[sae] ${request.method ?? "GET"} ${requestPathForLog(request.url ?? "/")}` +
        ` ${response.statusCode} ${formatDuration(requestStartedAt)}`,
      );
    }
  });
  const close = (): void => {
    if (closing) return;
    closing = true;
    if (timer) clearTimeout(timer);
    console.log("[sae] Stopping dev server...");
    watcher.close();
    server.close(() => console.log("[sae] Dev server stopped."));
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      server.once("error", onError);
      server.listen(options.port, () => {
        server.off("error", onError);
        printDevBuildResult("Built", result, initialBuildStartedAt);
        console.log(`[sae] Output: ${result.outputRoot}`);
        console.log(`[sae] Local: http://localhost:${options.port}`);
        console.log("[sae] Watching for changes. Press Ctrl+C to stop.");
        resolve();
      });
    });
  } catch (error) {
    process.off("SIGINT", close);
    process.off("SIGTERM", close);
    watcher.close();
    throw error;
  }
}

function printError(error: unknown): void {
  if (error instanceof BuilderError) {
    console.error(`[${error.code}] ${error.message}`);
    const diagnostics = error.details?.diagnostics;
    if (Array.isArray(diagnostics)) {
      for (const item of diagnostics) {
        if (!item || typeof item !== "object") continue;
        const diagnostic = item as Record<string, unknown>;
        console.error(
          `${String(diagnostic.severity ?? "error").toUpperCase()} ${String(diagnostic.ruleId ?? "builder")}` +
          ` ${String(diagnostic.source ?? diagnostic.route ?? "site")}: ${String(diagnostic.message ?? "")}`,
        );
      }
    }
    return;
  }
  console.error(error instanceof Error ? error.message : String(error));
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === "help" || options.command === "--help" || options.command === "-h") {
    console.log(usage());
    return;
  }
  if (options.command === "build") {
    const result = await build({ ...buildOptions(options), mode: "production" });
    printResult("Build complete", result.pages.length, result.outputRoot);
    return;
  }
  if (options.command === "check") {
    const result = await check({ ...buildOptions(options), mode: "production" });
    printResult("Check passed", result.pages.length, result.outputRoot);
    return;
  }
  if (options.command === "clean") {
    await clean(options);
    return;
  }
  if (options.command === "dev") {
    await dev(options);
    return;
  }
  if (options.command === "inspect") {
    const report = await inspect(options.inspectTarget ?? "", {
      ...buildOptions(options),
      mode: "production",
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  throw new Error(`Unknown command: ${options.command}\n\n${usage()}`);
}

main().catch((error) => {
  printError(error);
  process.exitCode = 1;
});
