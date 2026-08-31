import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";

import {
  ContentLoadError,
  createContentRepository,
  defineCollection,
  loadContent,
} from "../../src/content/index.js";

async function write(root: string, relativePath: string, contents: string): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

function document(extra = ""): string {
  return `---
title: "Collection entry"
description: "A complete collection integration fixture description."
slug: "/entry"
${extra}---
# Collection entry
`;
}

test("content loading applies directory collections, schema parsing, and default locale normalization", async () => {
  const root = await mkdtemp(path.join(process.cwd(), ".test-tmp-collection-"));
  try {
    await write(root, "content/articles/entry.md", document("kind: guide\ntags: [one]\n"));
    const guides = defineCollection({
      name: "guides",
      directory: "articles",
      schema: {
        parse(value: unknown) {
          const record = value as Record<string, unknown>;
          if (record.kind !== "guide") throw new TypeError("kind must be guide");
          return { ...record, schemaValidated: true };
        },
      },
    });
    const entries = await loadContent({
      contentRoot: path.join(root, "content"),
      outputRoot: path.join(root, "dist"),
      siteUrl: "https://example.test/",
      collections: [guides],
      i18n: {
        defaultLocale: "en",
        locales: ["en", "ko"],
        routing: "prefix-except-default",
      },
    });

    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.equal(entry?.collection, "guides");
    assert.equal(entry?.frontmatter.collection, "guides");
    assert.equal(entry?.frontmatter.locale, "en");
    assert.equal(entry?.frontmatter.schemaValidated, true);
    const repository = createContentRepository(entries);
    assert.equal(repository.collection("guides").where({ locale: "en" }).count(), 1);
    assert.equal(repository.collection("guides").filter({ kind: "guide" }).first(), entry);
    assert.deepEqual(repository.collections(), ["guides"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("content loading rejects unknown collections, directory mismatches, and schema errors", async () => {
  const root = await mkdtemp(path.join(process.cwd(), ".test-tmp-collection-errors-"));
  try {
    const contentRoot = path.join(root, "content");
    await write(root, "content/other/entry.md", document());
    await assert.rejects(
      () => loadContent({
        contentRoot,
        outputRoot: path.join(root, "dist"),
        siteUrl: "https://example.test/",
        collections: ["guides"],
      }),
      (error: unknown) => error instanceof ContentLoadError
        && /not inside a configured collection directory/u.test(error.message),
    );

    await rm(contentRoot, { recursive: true, force: true });
    await write(root, "content/guides/entry.md", document("collection: missing\n"));
    await assert.rejects(
      () => loadContent({
        contentRoot,
        outputRoot: path.join(root, "dist"),
        siteUrl: "https://example.test/",
        collections: ["guides"],
      }),
      /Unknown collection 'missing'/u,
    );

    await rm(contentRoot, { recursive: true, force: true });
    await write(root, "content/guides/entry.md", document("collection: pages\n"));
    await assert.rejects(
      () => loadContent({
        contentRoot,
        outputRoot: path.join(root, "dist"),
        siteUrl: "https://example.test/",
        collections: ["guides", "pages"],
      }),
      /does not match directory mapping/u,
    );

    await rm(contentRoot, { recursive: true, force: true });
    await write(root, "content/guides/entry.md", document());
    await assert.rejects(
      () => loadContent({
        contentRoot,
        outputRoot: path.join(root, "dist"),
        siteUrl: "https://example.test/",
        collections: [{
          name: "guides",
          schema: { parse: () => { throw new TypeError("audience is required"); } },
        }],
      }),
      /Collection schema 'guides' rejected front matter: audience is required/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
