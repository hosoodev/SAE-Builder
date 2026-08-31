const ADSENSE_AUTHORITY_ID = "f08c47fec0942fa0";
/** Render deterministic production-only webmaster, analytics, and advertising tags. */
export function renderIntegrationHead(config) {
    const lines = [];
    if (config.naverSiteVerification) {
        lines.push(`<meta name="naver-site-verification" content="${config.naverSiteVerification}">`);
    }
    if (config.googleAdSense) {
        lines.push(`<meta name="google-adsense-account" content="${config.googleAdSense}">`);
    }
    if (config.naverAnalytics) {
        lines.push('<script src="https://wcs.pstatic.net/wcslog.js"></script>', "<script>", "window.wcs_add = window.wcs_add || {};", `window.wcs_add["wa"] = ${JSON.stringify(config.naverAnalytics)};`, "if (window.wcs) {", "  window.wcs_do();", "}", "</script>");
    }
    if (config.googleAnalytics) {
        const id = JSON.stringify(config.googleAnalytics);
        lines.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${config.googleAnalytics}"></script>`, "<script>", "window.dataLayer = window.dataLayer || [];", "function gtag(){window.dataLayer.push(arguments);}", 'gtag("js", new Date());', `gtag("config", ${id});`, "</script>");
    }
    if (config.googleAdSense) {
        lines.push(`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.googleAdSense}" crossorigin="anonymous"></script>`);
    }
    return lines.join("\n");
}
/** Generate the standard Google AdSense authorization record. */
export function generateGoogleAdsTxt(publisherId) {
    if (!/^ca-pub-[0-9]+$/u.test(publisherId)) {
        throw new TypeError("Google AdSense publisher ID must match ca-pub-<digits>.");
    }
    return `google.com, ${publisherId.slice(3)}, DIRECT, ${ADSENSE_AUTHORITY_ID}\n`;
}
/** Render the Daum webmaster verification comment without accepting arbitrary directives. */
export function daumWebmasterComment(key) {
    if (!/^[A-Za-z0-9_-]+:[A-Za-z0-9+/_=-]+$/u.test(key)) {
        throw new TypeError("Daum webmaster verification key is invalid.");
    }
    return `DaumWebMasterTool:${key}`;
}
//# sourceMappingURL=integrations.js.map