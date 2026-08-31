import assert from "node:assert/strict";
import { test } from "node:test";

import { applySiteBasePath } from "../../src/build/base-path.js";

test("base-path rewriting prefixes site-local HTML URLs exactly once", () => {
  const output = applySiteBasePath(`<!doctype html><html><head>
    <link rel="canonical" href="https://example.test/docs/page/">
    <link rel="stylesheet" href="/assets/main.css">
  </head><body>
    <a href="/">Home</a><a href="/docs/about/">About</a><a href="#answer">Answer</a>
    <img src="/images/a.jpg" srcset="/images/a.jpg 1x, /images/a-2x.jpg 2x" alt="">
    <form action="/search/"></form><a href="//cdn.example/a">CDN</a>
  </body></html>`, "https://example.test/docs/");

  assert.match(output, /href="\/docs\/assets\/main\.css"/);
  assert.match(output, /href="\/docs\/"/);
  assert.match(output, /href="\/docs\/about\/"/);
  assert.match(output, /href="#answer"/);
  assert.match(output, /src="\/docs\/images\/a\.jpg"/);
  assert.match(output, /srcset="\/docs\/images\/a\.jpg 1x, \/docs\/images\/a-2x\.jpg 2x"/);
  assert.match(output, /action="\/docs\/search\/"/);
  assert.match(output, /href="\/\/cdn\.example\/a"/);
  assert.doesNotMatch(output, /\/docs\/docs\//);
});

test("origin-root sites preserve exact HTML bytes", () => {
  const html = "<!doctype html><html><head></head><body><a href=\"/a/\">A</a></body></html>";
  assert.equal(applySiteBasePath(html, "https://example.test/"), html);
});
