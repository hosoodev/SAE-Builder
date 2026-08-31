import assert from "node:assert/strict";
import test from "node:test";

import {
  daumWebmasterComment,
  generateGoogleAdsTxt,
  renderIntegrationHead,
} from "../../src/seo/index.js";

test("integration head renders configured webmaster, analytics, and advertising tags", () => {
  const head = renderIntegrationHead({
    naverAnalytics: "naver123",
    naverSiteVerification: "verify123",
    googleAnalytics: "G-ABC123",
    googleAdSense: "ca-pub-1234567890",
  });

  assert.match(head, /name="naver-site-verification" content="verify123"/u);
  assert.match(head, /https:\/\/wcs\.pstatic\.net\/wcslog\.js/u);
  assert.match(head, /window\.wcs_add\["wa"\] = "naver123"/u);
  assert.match(head, /googletagmanager\.com\/gtag\/js\?id=G-ABC123/u);
  assert.match(head, /gtag\("config", "G-ABC123"\)/u);
  assert.match(head, /name="google-adsense-account" content="ca-pub-1234567890"/u);
  assert.match(head, /adsbygoogle\.js\?client=ca-pub-1234567890/u);
});

test("AdSense and Daum verification outputs are exact and reject malformed keys", () => {
  assert.equal(
    generateGoogleAdsTxt("ca-pub-3029530441363057"),
    "google.com, pub-3029530441363057, DIRECT, f08c47fec0942fa0\n",
  );
  assert.equal(
    daumWebmasterComment("hash:signed=="),
    "DaumWebMasterTool:hash:signed==",
  );
  assert.throws(() => generateGoogleAdsTxt("pub-123"), /ca-pub/u);
  assert.throws(() => daumWebmasterComment("bad\nvalue"), /invalid/u);
});
