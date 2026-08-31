import assert from "node:assert/strict";
import { test } from "node:test";

import { TemplateError, renderTemplate } from "../../src/template/index.js";

test("templates support escaped, trusted raw, nested values, and recursive partials", async () => {
  const rendered = await renderTemplate(
    "{{> shell}}",
    { page: { title: "<Title>" }, content: "<strong>Trusted</strong>" },
    {
      rootDependencyId: "template:home",
      partials: {
        shell: "<h1>{{page.title}}</h1>{{> body}}",
        body: "{{{content}}}",
      },
    },
  );

  assert.equal(rendered.html, "<h1>&lt;Title&gt;</h1><strong>Trusted</strong>");
  assert.deepEqual(rendered.dependencies, ["template:home", "partial:shell", "partial:body"]);
});

test("missing partials and partial cycles fail with stable codes", async () => {
  await assert.rejects(
    renderTemplate("{{> missing}}", {}, {}),
    (error: unknown) => error instanceof TemplateError && error.code === "MISSING_PARTIAL",
  );
  await assert.rejects(
    renderTemplate("{{> a}}", {}, { partials: { a: "{{> b}}", b: "{{> a}}" } }),
    (error: unknown) => error instanceof TemplateError && error.code === "PARTIAL_CYCLE",
  );
});

test("raw values containing template-looking text are inserted exactly once", async () => {
  const rendered = await renderTemplate(
    "<main>{{{content}}}</main><p>{{summary}}</p>",
    {
      content: "<code>{{literal}}</code>{{{alsoLiteral}}}{{> notAPartial}}",
      summary: "Use {{braces}} & keep them",
    },
    { strictVariables: true },
  );

  assert.equal(
    rendered.html,
    "<main><code>{{literal}}</code>{{{alsoLiteral}}}{{> notAPartial}}</main>"
      + "<p>Use {{braces}} &amp; keep them</p>",
  );
});
