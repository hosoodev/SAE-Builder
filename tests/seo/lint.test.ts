import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMetadata,
  createArticleSchema,
  createFaqPageSchema,
  createJsonLdGraph,
  diagnoseHtmlPage,
  diagnoseSeoSite,
  renderJsonLd,
  renderMetadataTags,
  type JsonLdValue,
  type SeoHtmlPage,
} from "../../src/seo/index.js";

const OPTIONS = {
  siteUrl: "https://example.test/",
  titleLength: {},
  descriptionLength: {},
};

function pageHtml(route: string, body: string, schema?: JsonLdValue, noindex = false): string {
  const metadata = buildMetadata({
    siteUrl: OPTIONS.siteUrl,
    route,
    title: `Title ${route}`,
    description: `Description for ${route}`,
    noindex,
  });
  return `<!doctype html><html><head>${renderMetadataTags(metadata)}${schema ? renderJsonLd(schema) : ""}</head><body>${body}</body></html>`;
}

test("parse5 diagnostics accept semantic HTML with direct answers, matching schema, and valid links", () => {
  const canonical = "https://example.test/guide";
  const schema = createJsonLdGraph([
    createArticleSchema({
      name: "Guide",
      description: "Description for /guide",
      url: canonical,
      dateModified: "2026-08-27",
    }),
    createFaqPageSchema([{ question: "무엇인가요?", answer: "이것은 화면에 표시되는 직접적인 답변입니다." }]),
  ]);
  const pages: SeoHtmlPage[] = [
    {
      route: "/",
      html: pageHtml("/", '<main><h1>Home</h1><a href="/guide">Guide</a></main>'),
    },
    {
      route: "/guide",
      updated: "2026-08-27",
      html: pageHtml(
        "/guide",
        '<main><h1>Guide</h1><h2>무엇인가요?</h2><p>이것은 화면에 표시되는 직접적인 답변입니다.</p><a href="/">Home</a></main>',
        schema,
      ),
    },
  ];
  assert.deepEqual(diagnoseSeoSite(pages, OPTIONS), []);
});

test("HTML diagnostics report metadata, semantic, AEO, JSON-LD, and noindex errors", () => {
  const html = `<!doctype html><html><head>
    <title>One</title><title>Two</title>
    <meta name="description" content="short"><meta name="description" content="duplicate">
    <link rel="canonical" href="/relative">
    <script type="application/ld+json">{"broken":</script>
  </head><body><h1>One</h1><h1>Two</h1><h3>어떻게 하나요?</h3><span>not an answer</span><img src="x.png"></body></html>`;
  const diagnostics = diagnoseHtmlPage({ route: "/bad", html, noindex: true }, OPTIONS);
  const rules = new Set(diagnostics.map((item) => item.ruleId));
  for (const expected of [
    "seo/title-duplicate",
    "seo/description-duplicate",
    "seo/canonical-invalid",
    "seo/h1-multiple",
    "seo/heading-level-jump",
    "seo/image-alt-missing",
    "seo/noindex-mismatch",
    "seo/jsonld-invalid",
    "aeo/direct-answer-missing",
  ]) {
    assert.equal(rules.has(expected), true, `missing ${expected}`);
  }
});

test("project HTML policy supports deterministic simple globs for elements and classes", () => {
  const html = pageHtml(
    "/",
    '<main><h1>Home</h1><div class="card shadow-large shadow-small">Content</div></main>',
  );
  const diagnostics = diagnoseHtmlPage(
    { route: "/", html },
    {
      ...OPTIONS,
      forbiddenElements: ["d*", "div"],
      forbiddenClasses: ["shadow-*"],
    },
  );
  assert.deepEqual(
    diagnostics.map(({ ruleId, message }) => ({ ruleId, message })),
    [
      {
        ruleId: "html/forbidden-class",
        message: 'Class "shadow-large" is forbidden by pattern "shadow-*".',
      },
      {
        ruleId: "html/forbidden-class",
        message: 'Class "shadow-small" is forbidden by pattern "shadow-*".',
      },
      {
        ruleId: "html/forbidden-element",
        message: 'Element <div> is forbidden by pattern "d*".',
      },
    ],
  );
});

test("site diagnostics find conflicts, broken links, base escapes, fragments, and orphans deterministically", () => {
  const pages: SeoHtmlPage[] = [
    {
      source: "content/index.md",
      route: "/base",
      html: pageHtml("/base", '<main><h1>Base</h1><a href="/target/#missing">Target</a><a href="/missing">Missing</a></main>'),
    },
    {
      source: "content/target.md",
      route: "/target",
      html: pageHtml("/target", '<main><h1 id="top">Target</h1><a href="/">Home</a></main>'),
    },
    {
      source: "content/orphan.md",
      route: "/orphan",
      html: pageHtml("/orphan", "<main><h1>Orphan</h1></main>"),
    },
  ];
  const diagnostics = diagnoseSeoSite(pages, { ...OPTIONS, entryRoutes: ["/base"] });
  const rules = diagnostics.map((item) => item.ruleId);
  assert.ok(rules.includes("link/broken-fragment"));
  assert.ok(rules.includes("link/broken-internal"));
  assert.ok(rules.includes("link/orphan-page"));
  assert.deepEqual(diagnostics, diagnoseSeoSite([...pages].reverse(), { ...OPTIONS, entryRoutes: ["/base"] }));

  const escaped = diagnoseSeoSite(
    [{ route: "/", html: pageHtml("/", '<main><h1>Home</h1><a href="/outside">Outside</a></main>') }],
    { ...OPTIONS, siteUrl: "https://example.test/sub/" },
  );
  assert.ok(escaped.some((item) => item.ruleId === "link/site-base-escape"));
});
