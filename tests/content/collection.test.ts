import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContentRepository,
  defineCollection,
  paginateItems,
} from "../../src/content/collection.js";
import type { NormalizedContentEntry } from "../../src/content/loader.js";

function entry(slug: string, updated: string, tags: string[], category = "address"): NormalizedContentEntry {
  return {
    sourcePath: `${slug}.md`, sourceRelativePath: `${slug}.md`, collection: "guides", format: "markdown",
    frontmatter: { title: slug, description: slug, slug, updated, tags, category },
    rawBody: "", renderedBody: "",
    route: { slug, outputPath: `${slug}/index.html`, isExplicitFile: false },
    canonical: `https://example.test${slug}`, externalCanonical: false,
    assetReferences: { scripts: [], styles: [] }, dependencyIds: [],
    includeInSitemap: true, includeInFeed: true,
  };
}

test("collection definitions reject traversal", () => {
  assert.equal(defineCollection({ name: "guides", directory: "guides" }).name, "guides");
  assert.throws(() => defineCollection({ name: "../guides" }), /Invalid collection name/);
  assert.throws(() => defineCollection({ name: "guides", directory: "../outside" }), /directory/);
});

test("collection query filters, sorts, paginates, and indexes taxonomies", () => {
  const a = entry("/a", "2026-08-01", ["line"]);
  const b = entry("/b", "2026-08-03", ["line", "unit"]);
  const c = entry("/c", "2026-08-02", ["postal"], "shipping");
  const query = new ContentRepository([a, b, c]).collection("guides");

  assert.deepEqual(query.sort("updated", "desc").all().map((item) => item.route.slug), ["/b", "/c", "/a"]);
  assert.deepEqual(query.where((item) => item.frontmatter.tags?.includes("line") ?? false).all(), [a, b]);
  assert.deepEqual(query.paginate(2).map((page) => page.items.length), [2, 1]);
  assert.deepEqual([...query.tagIndex().keys()], ["line", "postal", "unit"]);
  assert.deepEqual([...query.categoryIndex().keys()], ["address", "shipping"]);
  assert.deepEqual(query.related(a).map((item) => item.route.slug), ["/b"]);
});

test("empty pagination remains a single stable empty page", () => {
  assert.deepEqual(paginateItems([], 10), [{ items: [], page: 1, pageSize: 10, pageCount: 1, total: 0 }]);
});
