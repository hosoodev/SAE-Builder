import assert from "node:assert/strict";
import test from "node:test";

import type { BuildResult, BuiltPage } from "../../src/build/index.js";
import { BuilderError } from "../../src/core/index.js";
import {
  inspectBuildResult,
  inspectBuiltPage,
  normalizeInspectTarget,
} from "../../src/inspect/index.js";

const page: BuiltPage = {
  source: "/project/content/guide.md",
  route: "/guide/test",
  canonical: "https://example.test/base/guide/test/",
  outputPath: "/project/dist/guide/test/index.html",
  dependencies: [
    "partial:z-footer",
    "content:guide.md",
    "template:guide",
    "asset:tool",
    "partial:a-header",
    "partial:a-header",
  ],
  html: `<!doctype html>
<html lang="ko"><head>
  <link rel="alternate stylesheet" href="/assets/site.css">
  <link rel="canonical" href="https://example.test/base/guide/test/">
  <link rel="alternate" hreflang="x-default" href="https://example.test/base/guide/test/">
  <link rel="alternate" hreflang="en" href="https://example.test/base/en/guide/test/">
  <script type="application/ld+json">{"z":1,"a":{"z":2,"a":1}}</script>
  <script type="module" src="/assets/tool.js"></script>
</head><body><h1>Test</h1></body></html>`,
};

function resultFor(builtPage: BuiltPage): BuildResult {
  return {
    root: "/project",
    outputRoot: "/project/dist",
    pages: [builtPage],
    assets: {},
    diagnostics: [],
    written: false,
  };
}

test("inspectBuiltPage derives a deterministic report from HTML and dependencies", () => {
  const report = inspectBuiltPage(page);
  assert.equal(report.source, page.source);
  assert.equal(report.route, "/guide/test");
  assert.equal(report.layout, "guide");
  assert.deepEqual(report.partials, ["a-header", "z-footer"]);
  assert.equal(report.canonical, page.canonical);
  assert.equal(report.locale, "ko");
  assert.deepEqual(report.hreflangAlternatives, [
    { hreflang: "en", href: "https://example.test/base/en/guide/test/" },
    { hreflang: "x-default", href: "https://example.test/base/guide/test/" },
  ]);
  assert.deepEqual(report.jsonLd, [{ a: { a: 1, z: 2 }, z: 1 }]);
  assert.deepEqual(report.dependencies, [
    "asset:tool",
    "content:guide.md",
    "partial:a-header",
    "partial:z-footer",
    "template:guide",
  ]);
  assert.deepEqual(report.assets, { css: ["/assets/site.css"], js: ["/assets/tool.js"] });
  assert.equal(JSON.stringify(report), JSON.stringify(inspectBuiltPage(page)));
});

test("inspect target normalization accepts routes and canonical URLs", () => {
  assert.deepEqual(normalizeInspectTarget("/guide/test"), { kind: "route", route: "/guide/test" });
  assert.deepEqual(normalizeInspectTarget("https://example.test/base/guide/test"), {
    kind: "url",
    url: "https://example.test/base/guide/test",
    pathname: "/base/guide/test",
  });
  assert.throws(() => normalizeInspectTarget("https://example.test/guide/?preview=1"), /query string/);
});

test("inspectBuildResult matches canonical URLs and fails clearly for unknown routes", () => {
  assert.equal(
    inspectBuildResult(resultFor(page), "https://example.test/base/guide/test").route,
    "/guide/test",
  );
  assert.throws(
    () => inspectBuildResult(resultFor(page), "/missing"),
    (error: unknown) => error instanceof BuilderError
      && error.code === "INSPECT_NOT_FOUND"
      && error.message.includes("/missing"),
  );
});
