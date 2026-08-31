import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { loadContent, loadContentFile } from "../../src/content/index.js";
import { BuilderError } from "../../src/core/index.js";
import { FileTemplateLoader } from "../../src/template/index.js";

async function withTemporaryDirectory(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "sae-content-test-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("content loading creates normalized records and derives collections", async () => {
  await withTemporaryDirectory(async (root) => {
    const contentRoot = path.join(root, "content");
    await mkdir(path.join(contentRoot, "guides"), { recursive: true });
    await writeFile(path.join(contentRoot, "guides", "example.md"), `---
title: Example
description: Description
slug: /guide/example
layout: guide
scripts: [tool]
---
# Example
`);

    const entries = await loadContent({
      contentRoot,
      outputRoot: path.join(root, "dist"),
      siteUrl: "https://example.com",
      production: true,
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].collection, "guides");
    assert.equal(entries[0].route.slug, "/guide/example");
    assert.equal(entries[0].canonical, "https://example.com/guide/example");
    assert.deepEqual(entries[0].dependencyIds, [
      "content:guides/example.md",
      "template:guide",
      "asset:tool",
    ]);
  });
});

test("file template loader caches sources and returns dependency ids", async () => {
  await withTemporaryDirectory(async (root) => {
    const layouts = path.join(root, "layouts");
    const partials = path.join(root, "partials");
    await mkdir(layouts, { recursive: true });
    await mkdir(partials, { recursive: true });
    await writeFile(path.join(layouts, "default.html"), "{{> header}}<main>{{{content}}}</main>");
    await writeFile(path.join(partials, "header.html"), "<header>{{site.name}}</header>");

    const loader = new FileTemplateLoader({ root });
    const first = await loader.renderLayout("default", {
      site: { name: "SAE" },
      content: "<h1>Home</h1>",
    });
    await writeFile(path.join(partials, "header.html"), "changed");
    const cached = await loader.renderLayout("default", {
      site: { name: "SAE" },
      content: "<h1>Home</h1>",
    });

    assert.equal(first.html, "<header>SAE</header><main><h1>Home</h1></main>");
    assert.equal(cached.html, first.html);
    assert.deepEqual(first.dependencies, ["template:default", "partial:header"]);
  });
});

test("content file entries must be relative to their declared content root", async () => {
  await withTemporaryDirectory(async (root) => {
    const contentRoot = path.join(root, "content");
    await mkdir(contentRoot);
    await writeFile(path.join(root, "outside.md"), "outside", "utf8");
    const options = {
      contentRoot,
      outputRoot: path.join(root, "dist"),
      siteUrl: "https://example.test",
    };

    await assert.rejects(
      () => loadContentFile("../outside.md", options),
      (error: unknown) => error instanceof BuilderError && error.code === "PATH_INVALID",
    );
    await assert.rejects(
      () => loadContentFile(path.join(root, "outside.md"), options),
      (error: unknown) => error instanceof BuilderError && error.code === "PATH_INVALID",
    );
  });
});

test("content and template loaders reject symlinked ancestor directories", async (t) => {
  await withTemporaryDirectory(async (root) => {
    const contentRoot = path.join(root, "content");
    const templatesRoot = path.join(root, "templates");
    const outsideContent = path.join(root, "outside-content");
    const outsideLayouts = path.join(root, "outside-layouts");
    const outsideTemplateRoot = path.join(root, "outside-template-root");
    await mkdir(contentRoot);
    await mkdir(templatesRoot);
    await mkdir(outsideContent);
    await mkdir(outsideLayouts);
    await mkdir(path.join(outsideTemplateRoot, "layouts"), { recursive: true });
    await writeFile(path.join(outsideContent, "secret.md"), "# secret", "utf8");
    await writeFile(path.join(outsideLayouts, "default.html"), "secret", "utf8");
    await writeFile(path.join(outsideTemplateRoot, "layouts", "default.html"), "secret", "utf8");

    try {
      await symlink(outsideContent, path.join(contentRoot, "linked"), "junction");
      await symlink(outsideLayouts, path.join(templatesRoot, "layouts"), "junction");
      await symlink(outsideTemplateRoot, path.join(root, "template-root-link"), "junction");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        t.skip("Creating a junction is not permitted in this environment");
        return;
      }
      throw error;
    }

    await assert.rejects(
      () => loadContent({
        contentRoot,
        outputRoot: path.join(root, "dist"),
        siteUrl: "https://example.test",
      }),
      (error: unknown) => error instanceof BuilderError && error.code === "SYMLINK_NOT_ALLOWED",
    );
    const loader = new FileTemplateLoader({ root: templatesRoot });
    await assert.rejects(
      () => loader.loadLayout("default"),
      (error: unknown) => error instanceof BuilderError && error.code === "SYMLINK_NOT_ALLOWED",
    );
    const rootLinkLoader = new FileTemplateLoader({ root: path.join(root, "template-root-link") });
    await assert.rejects(
      () => rootLinkLoader.loadLayout("default"),
      (error: unknown) => error instanceof BuilderError && error.code === "SYMLINK_NOT_ALLOWED",
    );
  });
});

test("template subdirectories cannot escape their declared root", () => {
  assert.throws(
    () => new FileTemplateLoader({ root: process.cwd(), layoutsDirectory: "../outside" }),
    (error: unknown) => error instanceof BuilderError && error.code === "PATH_INVALID",
  );
});
