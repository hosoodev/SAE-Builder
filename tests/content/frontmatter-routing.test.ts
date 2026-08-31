import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";

import {
  FrontMatterError,
  parseFrontMatter,
} from "../../src/content/index.js";
import {
  RouteError,
  assertUniqueSlugs,
  createPageRoute,
  normalizeSlug,
  resolveCanonical,
} from "../../src/routing/index.js";

test("front matter validates known fields and preserves site fields", () => {
  const parsed = parseFrontMatter(`---
title: Example
description: A useful description
slug: /guide/example
updated: "2026-08-27"
customField: retained
---
# Example
`);

  assert.equal(parsed.frontmatter.customField, "retained");
  assert.match(parsed.body, /# Example/);
});

test("front matter rejects invalid calendar dates", () => {
  assert.throws(
    () => parseFrontMatter(`---
title: Example
description: Description
slug: /
updated: "2026-02-30"
---`),
    FrontMatterError,
  );
});

test("slugs normalize safely and map below the output root", () => {
  assert.equal(normalizeSlug("/guide/example"), "/guide/example");
  assert.equal(normalizeSlug("/feed.xml"), "/feed.xml");
  const route = createPageRoute(path.join("workspace", "dist"), "/guide/example");
  assert.equal(route.outputPath, path.resolve("workspace", "dist", "guide", "example", "index.html"));
  const noTrailingSlashRoute = createPageRoute(
    path.join("workspace", "dist"),
    "/guide/example",
    false,
  );
  assert.equal(
    noTrailingSlashRoute.outputPath,
    path.resolve("workspace", "dist", "guide", "example.html"),
  );

  for (const unsafe of ["guide/a", "/../secret", "/%2e%2e/secret", "/a%2fb", "/a\\b", "/a?b"] ) {
    assert.throws(() => normalizeSlug(unsafe), RouteError);
  }
});

test("duplicate normalized slugs fail", () => {
  const entries = [{ slug: "/guide/a" }, { slug: "/guide/a" }];
  assert.throws(
    () => assertUniqueSlugs(entries, (entry) => entry.slug),
    (error: unknown) => error instanceof RouteError && error.code === "DUPLICATE_SLUG",
  );
});

test("canonical routes remain below a configured site base path", () => {
  assert.deepEqual(
    resolveCanonical("https://example.test/docs/", "/guide/a"),
    { url: "https://example.test/docs/guide/a", external: false },
  );
  assert.deepEqual(
    resolveCanonical("https://example.test/docs/", "/guide/a", "/canonical"),
    { url: "https://example.test/docs/canonical", external: false },
  );
  assert.equal(
    resolveCanonical("https://example.test/docs/", "/guide/a", "https://example.test/outside/").external,
    true,
  );
});
