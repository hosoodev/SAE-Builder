import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

import { build } from "../../src/build/index.js";

async function write(root: string, relativePath: string, contents: string): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

test("i18n build localizes routes, head links, site-base assets, and sitemap files", async () => {
  const root = await mkdtemp(path.join(process.cwd(), ".test-tmp-i18n-"));
  try {
    await write(root, "builder.config.mjs", `export default {
      site: { name: "Localized Fixture", url: "https://example.test/docs/", language: "ko-KR" },
      i18n: {
        defaultLocale: "ko",
        locales: ["ko", "en"],
        routing: "prefix-except-default"
      },
      content: { collections: ["pages"] },
      assets: { styles: { styles: "src/styles.css" } },
      seo: { feed: { description: "Localized integration fixture feed." } }
    };\n`);
    await write(root, "templates/layouts/default.html", `<!doctype html>
<html lang="{{lang}}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg">{{{head}}}
</head><body><nav aria-label="Languages"><a href="/guide">한국어</a><a href="/en/guide">English</a></nav><main>{{{content}}}</main></body></html>`);
    await write(root, "content/pages/guide-ko.md", `---
title: "한국어 지역화 가이드"
description: "기본 언어와 사이트 기본 경로를 함께 검증하는 충분히 자세한 한국어 설명입니다."
slug: "/guide"
translationKey: "guide"
updated: "2026-08-26"
---
# 한국어 가이드

## 이 페이지는 무엇을 검증하나요?

기본 로케일이 생략되면 한국어로 정규화되는지 검증합니다.
`);
    await write(root, "content/pages/guide-en.md", `---
title: "English localized guide"
description: "A detailed English description for the localized integration fixture page."
slug: "/guide"
locale: "en"
translationKey: "guide"
updated: "2026-08-27"
---
# English guide

## What does this page verify?

It verifies locale-prefixed routing and reciprocal alternate metadata.
`);
    await write(root, "src/styles.css", "main { max-width: 60rem; margin: auto; }\n");
    await write(root, "public/favicon.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n");

    const result = await build({ root, mode: "production" });
    assert.deepEqual(result.pages.map(({ route }) => route).sort(), ["/en/guide", "/guide"]);
    assert.equal(result.content.collection("pages").where({ locale: "ko" }).count(), 1);
    assert.equal(result.content.collection("pages").where({ locale: "en" }).count(), 1);

    const ko = await readFile(path.join(root, "dist/guide/index.html"), "utf8");
    const en = await readFile(path.join(root, "dist/en/guide/index.html"), "utf8");
    for (const html of [ko, en]) {
      assert.match(html, /href="https:\/\/example\.test\/docs\/guide"/u);
      assert.match(html, /hreflang="ko"/u);
      assert.match(html, /hreflang="en"/u);
      assert.match(html, /hreflang="x-default"/u);
      assert.match(html, /href="\/docs\/assets\/styles\.[a-f0-9]{10}\.css"/u);
      assert.match(html, /href="\/docs\/favicon\.svg"/u);
      assert.match(html, /href="\/docs\/en\/guide"/u);
      assert.doesNotMatch(html, /(?:href|src)="\/(?!docs\/)/u);
    }
    assert.match(en, /<link rel="canonical" href="https:\/\/example\.test\/docs\/en\/guide">/u);

    const manifest = JSON.parse(
      await readFile(path.join(root, "dist/assets/manifest.json"), "utf8"),
    ) as Record<string, string>;
    assert.match(manifest.styles ?? "", /^\/docs\/assets\/styles\.[a-f0-9]{10}\.css$/u);

    const sitemapIndex = await readFile(path.join(root, "dist/sitemap.xml"), "utf8");
    const koSitemap = await readFile(path.join(root, "dist/sitemap-ko.xml"), "utf8");
    const enSitemap = await readFile(path.join(root, "dist/sitemap-en.xml"), "utf8");
    assert.match(sitemapIndex, /https:\/\/example\.test\/docs\/sitemap-ko\.xml/u);
    assert.match(sitemapIndex, /https:\/\/example\.test\/docs\/sitemap-en\.xml/u);
    assert.match(koSitemap, /https:\/\/example\.test\/docs\/guide/u);
    assert.doesNotMatch(koSitemap, /\/docs\/en\/guide/u);
    assert.match(enSitemap, /https:\/\/example\.test\/docs\/en\/guide/u);
    assert.match(
      await readFile(path.join(root, "dist/robots.txt"), "utf8"),
      /^Sitemap: https:\/\/example\.test\/docs\/sitemap\.xml$/mu,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
