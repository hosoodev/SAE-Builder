import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";

import { planCssEntries, planScriptEntries } from "../../src/assets/index.js";
import { BuilderError } from "../../src/core/index.js";

test("CSS and JavaScript entry paths cannot be absolute or traverse the project root", async () => {
  const temporaryRoot = path.join(process.cwd(), ".test-tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, "asset-boundary-"));
  const outsideCss = path.join(root, "..", "outside.css");
  const outsideJs = path.join(root, "..", "outside.ts");
  try {
    await writeFile(outsideCss, "body {}", "utf8");
    await writeFile(outsideJs, "export {};", "utf8");
    const common = { projectRoot: root, outputRoot: path.join(root, "dist"), hash: true, minify: true };

    await assert.rejects(
      () => planCssEntries({ ...common, entries: { main: "../outside.css" } }),
      (error: unknown) => error instanceof BuilderError && error.code === "PATH_INVALID",
    );
    await assert.rejects(
      () => planScriptEntries({ ...common, entries: { main: outsideJs } }),
      (error: unknown) => error instanceof BuilderError && error.code === "PATH_INVALID",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outsideCss, { force: true });
    await rm(outsideJs, { force: true });
  }
});

test("asset entries cannot pass through a symlinked directory", async (t) => {
  const temporaryRoot = path.join(process.cwd(), ".test-tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, "asset-symlink-"));
  const outside = path.join(root, "..", `${path.basename(root)}-outside`);
  await mkdir(outside);
  await writeFile(path.join(outside, "tool.ts"), "export {};", "utf8");

  try {
    try {
      await symlink(outside, path.join(root, "linked"), "junction");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        t.skip("Creating a junction is not permitted in this environment");
        return;
      }
      throw error;
    }

    await assert.rejects(
      () => planScriptEntries({
        projectRoot: root,
        outputRoot: path.join(root, "dist"),
        entries: { tool: "linked/tool.ts" },
        hash: true,
        minify: true,
      }),
      (error: unknown) => error instanceof BuilderError && error.code === "SYMLINK_NOT_ALLOWED",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("JavaScript imports cannot escape the project root", async () => {
  const temporaryRoot = path.join(process.cwd(), ".test-tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, "asset-import-boundary-"));
  const outside = path.join(root, "..", `${path.basename(root)}-outside.ts`);
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(outside, "export const value = 1;", "utf8");
    await writeFile(
      path.join(root, "src", "main.ts"),
      `import { value } from ${JSON.stringify(`../../${path.basename(outside)}`)}; console.log(value);`,
      "utf8",
    );
    await assert.rejects(
      () => planScriptEntries({
        projectRoot: root,
        outputRoot: path.join(root, "dist"),
        entries: { main: "src/main.ts" },
        hash: true,
        minify: true,
      }),
      (error: unknown) => error instanceof BuilderError && error.code === "PATH_OUTSIDE_ROOT",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { force: true });
  }
});
