import assert from "node:assert/strict";
import { test } from "node:test";

import { MarkdownError, renderMarkdown } from "../../src/markdown/index.js";

test("Markdown uses semantic AST transforms and escapes raw HTML by default", async () => {
  const result = await renderMarkdown(`# Heading

<script>alert(1)</script>

| A | B |
| - | - |
| 1 | 2 |

[outside](https://example.net)
`);

  assert.match(result.html, /<h1 id="heading"><a href="#heading">Heading<\/a><\/h1>/);
  assert.doesNotMatch(result.html, /<script>/i);
  assert.match(result.html, /script>alert\(1\)/);
  assert.match(
    result.html,
    /<figure class="content-table-scroll" role="region" aria-label="표 가로 스크롤 영역" tabindex="0"><table>/,
  );
  assert.match(result.html, /target="_blank"/);
  assert.match(result.html, /rel="nofollow noopener noreferrer"|rel="noopener noreferrer"/);
});

test("restricted MDX rejects executable syntax", async () => {
  await assert.rejects(
    renderMarkdown("import Widget from './widget.js'\n\n# Hello", { format: "mdx" }),
    MarkdownError,
  );
  await assert.rejects(
    renderMarkdown("# Hello {Date.now()}", { format: "mdx" }),
    MarkdownError,
  );
});

test("registered MDX components accept only literal allowlisted attributes", async () => {
  const options = {
    format: "mdx" as const,
    components: {
      Callout: {
        tagName: "aside",
        allowedAttributes: ["title"],
        fixedAttributes: { className: "callout" },
      },
    },
  };
  const rendered = await renderMarkdown(
    `<Callout title="Read this">Safe **content**</Callout>`,
    options,
  );
  assert.match(rendered.html, /<aside class="callout" title="Read this">/);
  assert.match(rendered.html, /<strong>content<\/strong>/);

  await assert.rejects(
    renderMarkdown(`<Callout title={Date.now()}>Unsafe</Callout>`, options),
    MarkdownError,
  );
});
