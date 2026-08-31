import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";

import {
  BuilderError,
  loadConfig,
  resolveConfig,
  type UserConfig,
} from "../../src/core/index.js";
import { defineCollection } from "../../src/content/index.js";
import {
  assertInsideRoot,
  discoverFiles,
  isInsideRoot,
  resolveFileInsideRoot,
  resolveInsideRoot,
} from "../../src/filesystem/index.js";

const minimal: UserConfig = {
  site: { name: "Test", url: "https://example.test" },
};

test("config defaults resolve every path under the consumer root", () => {
  const root = path.resolve("fixture-root");
  const config = resolveConfig(minimal, root);
  assert.equal(config.site.defaultLocale, "en");
  assert.equal(config.site.url, "https://example.test/");
  assert.deepEqual(config.integrations, {});
  for (const target of Object.values(config.resolvedPaths)) {
    assert.equal(isInsideRoot(root, target), true);
  }
});

test("config accepts safe integration keys and rejects executable input", () => {
  const config = resolveConfig({
    ...minimal,
    integrations: {
      naverAnalytics: "naver123",
      naverSiteVerification: "verify123",
      daumSiteVerification: "hash:signed==",
      googleAnalytics: "G-ABC123",
      googleAdSense: "ca-pub-1234567890",
    },
  }, process.cwd());
  assert.equal(config.integrations.googleAnalytics, "G-ABC123");
  assert.equal(config.integrations.googleAdSense, "ca-pub-1234567890");

  assert.throws(
    () => resolveConfig({
      ...minimal,
      integrations: { googleAnalytics: '"></script>' },
    }, process.cwd()),
    (error: unknown) => error instanceof BuilderError && error.code === "CONFIG_INVALID",
  );
});

test("config rejects project-root escapes and invalid locale contracts", () => {
  assert.throws(
    () => resolveConfig({ ...minimal, paths: { output: "../outside" } }, process.cwd()),
    (error: unknown) => error instanceof BuilderError && error.code === "CONFIG_INVALID",
  );
  assert.throws(
    () => resolveConfig({
      site: {
        name: "Test",
        url: "https://example.test",
        defaultLocale: "ko",
        locales: ["en"],
      },
    }, process.cwd()),
    /must include site.defaultLocale/,
  );
});

test("config rejects unknown keys instead of silently stripping stale options", () => {
  assert.throws(
    () => resolveConfig({ ...minimal, staleOption: true } as UserConfig, process.cwd()),
    (error: unknown) => error instanceof BuilderError && error.code === "CONFIG_INVALID",
  );
  assert.throws(
    () => resolveConfig({
      ...minimal,
      assets: { legacyBundler: true },
    } as UserConfig, process.cwd()),
    (error: unknown) => error instanceof BuilderError && error.code === "CONFIG_INVALID",
  );
});

test("config normalizes legacy collections and preserves custom schema objects", () => {
  const schema = { parse: (value: unknown) => value };
  const guides = defineCollection({ name: "guides", directory: "articles", schema });
  const config = resolveConfig({
    ...minimal,
    content: { collections: ["pages", guides] },
  }, process.cwd());

  assert.deepEqual(config.content.collections.map(({ name, directory }) => ({ name, directory })), [
    { name: "pages", directory: "pages" },
    { name: "guides", directory: "articles" },
  ]);
  assert.equal(config.content.collections[1]?.schema, schema);
  assert.throws(
    () => resolveConfig({
      ...minimal,
      content: { collections: ["guides", { name: "GUIDES" }] },
    }, process.cwd()),
    /Duplicate collection name/u,
  );
  assert.throws(
    () => resolveConfig({
      ...minimal,
      content: {
        collections: [
          { name: "guides", directory: "articles" },
          { name: "news", directory: "ARTICLES" },
        ],
      },
    }, process.cwd()),
    /mapped by both/u,
  );
});

test("loadConfig resolves builder.config.mjs from the requested root", async () => {
  const parent = path.join(process.cwd(), ".test-tmp");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, "config-"));
  try {
    await writeFile(path.join(root, "builder.config.mjs"), `export default {
      site: { name: "Loaded", url: "https://loaded.example", defaultLocale: "ko", locales: ["ko"] }
    };\n`);
    const config = await loadConfig(root);
    assert.equal(config.root, root);
    assert.equal(config.site.name, "Loaded");
    assert.equal(config.site.defaultLocale, "ko");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("filesystem path helpers reject traversal", () => {
  const root = path.resolve("safe-root");
  assert.equal(resolveInsideRoot(root, "a", "b"), path.join(root, "a", "b"));
  assert.throws(
    () => assertInsideRoot(root, path.resolve(root, "..", "outside")),
    (error: unknown) => error instanceof BuilderError && error.code === "PATH_OUTSIDE_ROOT",
  );
});

test("config requires CSS and JavaScript entries to be project-relative", () => {
  assert.throws(
    () => resolveConfig({
      ...minimal,
      assets: { styles: { main: "../outside.css" } },
    }, process.cwd()),
    (error: unknown) => error instanceof BuilderError && error.code === "CONFIG_INVALID",
  );
  assert.throws(
    () => resolveConfig({
      ...minimal,
      assets: { scripts: { main: path.resolve("outside.ts") } },
    }, process.cwd()),
    (error: unknown) => error instanceof BuilderError && error.code === "CONFIG_INVALID",
  );
});

test("filesystem entry resolution rejects absolute paths, traversal, and symlink ancestors", async (t) => {
  const parent = path.join(process.cwd(), ".test-tmp");
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(path.join(parent, "filesystem-boundary-"));
  const root = path.join(temporary, "root");
  const outside = path.join(temporary, "outside");
  await mkdir(root);
  await mkdir(outside);
  await writeFile(path.join(outside, "secret.txt"), "secret", "utf8");

  try {
    await assert.rejects(
      () => resolveFileInsideRoot(root, "../outside/secret.txt"),
      (error: unknown) => error instanceof BuilderError && error.code === "PATH_INVALID",
    );
    await assert.rejects(
      () => resolveFileInsideRoot(root, path.join(outside, "secret.txt")),
      (error: unknown) => error instanceof BuilderError && error.code === "PATH_INVALID",
    );

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
      () => discoverFiles(root),
      (error: unknown) => error instanceof BuilderError && error.code === "SYMLINK_NOT_ALLOWED",
    );
    await assert.rejects(
      () => resolveFileInsideRoot(root, "linked/secret.txt"),
      (error: unknown) => error instanceof BuilderError && error.code === "SYMLINK_NOT_ALLOWED",
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
