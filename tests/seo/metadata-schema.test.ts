import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMetadata,
  canonicalBelongsToSite,
  createArticleSchema,
  createFaqPageSchema,
  createJsonLdGraph,
  renderJsonLd,
  renderMetadataTags,
  resolveCanonical,
  serializeJsonLd,
} from "../../src/seo/index.js";

test("canonical and metadata helpers honor a configured site base", () => {
  assert.equal(
    resolveCanonical({ siteUrl: "https://example.test/docs", route: "/guide/start" }),
    "https://example.test/docs/guide/start",
  );
  assert.equal(
    resolveCanonical({
      siteUrl: "https://example.test/docs/",
      route: "/guide/start",
      canonical: "https://publisher.test/original",
    }),
    "https://publisher.test/original",
  );
  assert.equal(canonicalBelongsToSite("https://example.test/docs/a/", "https://example.test/docs/"), true);
  assert.equal(canonicalBelongsToSite("https://example.test/outside/", "https://example.test/docs/"), false);

  const metadata = buildMetadata({
    siteUrl: "https://example.test/docs/",
    route: "/guide/start",
    title: "A <title>",
    description: 'A "description" & more',
    image: "/images/card.png",
    openGraphType: "article",
    noindex: true,
  });
  assert.equal(metadata.canonical, "https://example.test/docs/guide/start");
  assert.equal(metadata.openGraph.image, "https://example.test/docs/images/card.png");
  const tags = renderMetadataTags(metadata);
  assert.match(tags, /<title>A &lt;title&gt;<\/title>/u);
  assert.match(tags, /content="A &quot;description&quot; &amp; more"/u);
  assert.match(tags, /<meta name="robots" content="noindex,follow">/u);
});

test("internationalized hostnames remain readable in public metadata", () => {
  const metadata = buildMetadata({
    siteUrl: "https://영문주소변환.kr",
    route: "/guides",
    title: "Guide",
    description: "Guide description",
    image: "/og.png",
  });
  assert.equal(metadata.canonical, "https://영문주소변환.kr/guides");
  assert.equal(metadata.openGraph.image, "https://영문주소변환.kr/og.png");
  assert.match(renderMetadataTags(metadata), /https:\/\/영문주소변환\.kr\/guides/u);

  const article = createArticleSchema({
    name: "Guide",
    description: "Guide description",
    url: metadata.canonical,
  });
  assert.equal(article.url, "https://영문주소변환.kr/guides");
});

test("JSON-LD helpers serialize deterministically and safely without inventing dates or authors", () => {
  const article = createArticleSchema({
    name: "Guide </script>",
    description: "Visible & useful",
    url: "https://example.test/guide/",
  });
  assert.equal(article.dateModified, undefined);
  assert.equal(article.author, undefined);

  const faq = createFaqPageSchema([{ question: "How?", answer: "Use <this> safely." }]);
  const graph = createJsonLdGraph([article, faq]);
  const serialized = serializeJsonLd(graph);
  assert.equal(serialized.includes("</script>"), false);
  assert.match(serialized, /\\u003c\/script\\u003e/u);
  assert.equal(serialized, serializeJsonLd(graph));
  assert.equal(renderJsonLd(graph), `<script type="application/ld+json">${serialized}</script>`);

  assert.equal(serializeJsonLd({ z: 1, a: 2 }), '{"a":2,"z":1}');
});
