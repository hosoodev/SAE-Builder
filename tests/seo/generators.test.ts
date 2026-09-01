import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeXml,
  generateRobotsTxt,
  generateRss,
  generateSitemap,
  planLocalizedSitemaps,
} from "../../src/seo/index.js";

test("XML escaping covers text, attributes, and invalid XML characters", () => {
  assert.equal(escapeXml(`<tag a="x">Tom & Jerry's</tag>`), "&lt;tag a=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/tag&gt;");
  assert.throws(() => escapeXml("bad\u0000value"), /XML 1\.0/u);
});

test("sitemap output is sorted and excludes non-indexable pages and external canonicals", () => {
  const pages = [
    { route: "/z", updated: "2026-08-27", sitemap: { priority: 0.7, changefreq: "weekly" as const } },
    { route: "/draft", draft: true },
    { route: "/noindex", noindex: true },
    { route: "/redirect", redirect: true },
    { route: "/external", canonical: "https://publisher.test/original/" },
    { route: "/a", canonical: "https://example.test/a/" },
  ];
  const xml = generateSitemap(pages, { siteUrl: "https://example.test/" });
  assert.ok(xml.indexOf("https://example.test/a") < xml.indexOf("https://example.test/z"));
  assert.doesNotMatch(xml, /draft|noindex|redirect|publisher/u);
  assert.match(xml, /<lastmod>2026-08-27<\/lastmod>/u);
  assert.match(xml, /<changefreq>weekly<\/changefreq>/u);
  assert.equal(xml, generateSitemap([...pages].reverse(), { siteUrl: "https://example.test/" }));
});

test("localized sitemap planning groups locales and splits oversized groups into one index", () => {
  const artifacts = planLocalizedSitemaps([
    { route: "/a", locale: "ko", updated: "2026-08-20" },
    { route: "/b", locale: "ko", updated: "2026-08-21" },
    { route: "/c", locale: "ko", updated: "2026-08-22" },
    { route: "/en/a", locale: "en", updated: "2026-08-23" },
  ], {
    siteUrl: "https://example.test/docs/",
    locales: ["ko", "en"],
    maxUrls: 2,
  });

  assert.deepEqual(artifacts.map(({ relativePath }) => relativePath), [
    "sitemap-ko-1.xml",
    "sitemap-ko-2.xml",
    "sitemap-en.xml",
    "sitemap.xml",
  ]);
  const index = artifacts.at(-1)?.contents ?? "";
  assert.match(index, /https:\/\/example\.test\/docs\/sitemap-ko-1\.xml/u);
  assert.match(index, /https:\/\/example\.test\/docs\/sitemap-ko-2\.xml/u);
  assert.match(index, /https:\/\/example\.test\/docs\/sitemap-en\.xml/u);
  assert.match(index, /<lastmod>2026-08-23<\/lastmod>/u);
  assert.equal(artifacts.filter(({ index: isIndex }) => isIndex).length, 1);
});

test("RSS is deterministic, absolute, XML-safe, and derives dates only from content", () => {
  const items = [
    {
      route: "/older",
      title: "Older & wiser",
      description: "A <description>",
      date: "2026-08-01",
      author: "A & B",
    },
    { route: "/newer", title: "Newer", description: "Newest", date: "2026-08-20", updated: "2026-08-25" },
    { route: "/hidden", title: "Hidden", description: "Hidden", noindex: true },
    { route: "/external", title: "External", description: "External", canonical: "https://elsewhere.test/post/" },
  ];
  const options = {
    siteUrl: "https://example.test/",
    title: "Site & feed",
    description: "Updates <daily>",
  };
  const xml = generateRss(items, options);
  assert.ok(xml.indexOf("https://example.test/newer") < xml.indexOf("https://example.test/older"));
  assert.match(xml, /<lastBuildDate>Tue, 25 Aug 2026 00:00:00 GMT<\/lastBuildDate>/u);
  assert.match(xml, /Older &amp; wiser/u);
  assert.match(xml, /A &lt;description&gt;/u);
  assert.doesNotMatch(xml, /Hidden|elsewhere/u);
  assert.equal(xml, generateRss([...items].reverse(), options));
});

test("robots groups and sitemap declarations have stable ordering", () => {
  const text = generateRobotsTxt({
    siteUrl: "https://example.test/base/",
    rules: [
      { userAgent: "Bot", disallow: ["/z/", "/a/"] },
      { userAgent: "*", disallow: "/search/", allow: "/" },
      { userAgent: "Bot", allow: "/public/" },
    ],
  });
  assert.equal(
    text,
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /search/",
      "",
      "User-agent: Bot",
      "Allow: /public/",
      "Disallow: /a/",
      "Disallow: /z/",
      "",
      "Sitemap: https://example.test/base/sitemap.xml",
      "",
    ].join("\n"),
  );

  assert.match(
    generateRobotsTxt({ siteUrl: "https://example.test/", preview: true }),
    /^User-agent: \*\nDisallow: \/\n/u,
  );

  assert.match(
    generateRobotsTxt({
      siteUrl: "https://example.test/",
      comments: ["DaumWebMasterTool:hash:signed=="],
    }),
    /Sitemap: https:\/\/example\.test\/sitemap\.xml\n\n#DaumWebMasterTool:hash:signed==\n$/u,
  );
});

test("public discovery files preserve readable internationalized hostnames", () => {
  const siteUrl = "https://영문주소변환.kr/";
  assert.match(
    generateSitemap([{ route: "/guides" }], { siteUrl }),
    /<loc>https:\/\/영문주소변환\.kr\/guides<\/loc>/u,
  );
  assert.match(
    generateRss([{
      route: "/guides",
      title: "Guide",
      description: "Guide description",
      date: "2026-09-01",
    }], {
      siteUrl,
      title: "Site",
      description: "Site description",
    }),
    /<link>https:\/\/영문주소변환\.kr\/guides<\/link>/u,
  );
  assert.match(
    generateRobotsTxt({ siteUrl }),
    /Sitemap: https:\/\/영문주소변환\.kr\/sitemap\.xml/u,
  );
});
