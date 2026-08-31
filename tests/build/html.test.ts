import assert from "node:assert/strict";
import { test } from "node:test";

import { minifyHtmlDocument } from "../../src/build/html.js";

test("HTML minification removes comments without collapsing meaningful text", () => {
  const output = minifyHtmlDocument(
    "<!doctype html><html><head><!-- remove --></head><body><p>Hello <strong>wide</strong> world</p><pre>a  b\n</pre><!--remove--></body></html>",
  );

  assert.doesNotMatch(output, /remove/);
  assert.match(output, /Hello <strong>wide<\/strong> world/);
  assert.match(output, /<pre>a  b\n<\/pre>/);
});

test("HTML minification preserves conditional comments", () => {
  const output = minifyHtmlDocument(
    "<!doctype html><html><head></head><body><!--[if IE]>legacy<![endif]--></body></html>",
  );
  assert.match(output, /\[if IE\]/);
});
