import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createTranslationAlternates,
  localizeRoute,
  renderHreflangTags,
} from "../../src/i18n/index.js";

const prefixExceptDefault = {
  defaultLocale: "ko",
  locales: ["ko", "en", "ja"],
  routing: "prefix-except-default",
} as const;

test("locale routing supports both configured modes", () => {
  assert.equal(localizeRoute("/guide", "ko", prefixExceptDefault), "/guide");
  assert.equal(localizeRoute("/guide", "en", prefixExceptDefault), "/en/guide");
  assert.equal(localizeRoute("/", "ja", prefixExceptDefault), "/ja");
  assert.equal(localizeRoute("/guide", "ko", {
    ...prefixExceptDefault,
    routing: "prefix-all",
  }), "/ko/guide");
});

test("translation groups produce reciprocal locale and x-default links", () => {
  const alternatives = createTranslationAlternates([
    { route: "/guide", locale: "ko", translationKey: "guide" },
    { route: "/en/guide", locale: "en", translationKey: "guide" },
  ], "https://example.test/docs/", prefixExceptDefault);

  assert.deepEqual(alternatives.get("/guide"), [
    { hreflang: "ko", route: "/guide", url: "https://example.test/docs/guide" },
    { hreflang: "en", route: "/en/guide", url: "https://example.test/docs/en/guide" },
    { hreflang: "x-default", route: "/guide", url: "https://example.test/docs/guide" },
  ]);
  assert.deepEqual(alternatives.get("/en/guide"), alternatives.get("/guide"));
  assert.match(renderHreflangTags(alternatives.get("/guide") ?? []), /hreflang="x-default"/);
});

test("translation groups reject duplicate locales", () => {
  assert.throws(() => createTranslationAlternates([
    { route: "/a", locale: "ko", translationKey: "same" },
    { route: "/b", locale: "ko", translationKey: "same" },
  ], "https://example.test/", prefixExceptDefault), /more than one ko page/);
});
