import { escapeXml } from "./xml.js";
import { serializePublicUrl } from "../core/url.js";
function assertHttpUrl(url, label) {
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
        throw new TypeError(`${label} must be an HTTP(S) URL without credentials.`);
    }
}
function decodedPathSegments(pathname, label) {
    let decoded;
    try {
        decoded = decodeURIComponent(pathname);
    }
    catch {
        throw new TypeError(`${label} contains malformed percent encoding.`);
    }
    if (decoded.includes("\\")) {
        throw new TypeError(`${label} must not contain backslashes.`);
    }
    return decoded.split("/");
}
/** Normalize a content route without interpreting it as an origin-relative URL. */
export function normalizeSeoRoute(route) {
    const trimmed = route.trim();
    if (!trimmed.startsWith("/") || trimmed.includes("?") || trimmed.includes("#")) {
        throw new TypeError(`SEO route must start with "/" and contain no query or hash: ${route}`);
    }
    const segments = decodedPathSegments(trimmed, "SEO route");
    if (segments.some((segment) => segment === "." || segment === "..")) {
        throw new TypeError(`SEO route must not contain traversal segments: ${route}`);
    }
    const collapsed = trimmed.replace(/\/{2,}/gu, "/");
    if (collapsed === "/") {
        return collapsed;
    }
    return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}
/** Normalize and validate the configured public site base. */
export function normalizeSiteBase(siteUrl) {
    const url = new URL(siteUrl.toString());
    assertHttpUrl(url, "Site URL");
    if (url.search || url.hash) {
        throw new TypeError("Site URL must not contain a query or hash.");
    }
    const segments = decodedPathSegments(url.pathname, "Site URL path");
    if (segments.some((segment) => segment === "." || segment === "..")) {
        throw new TypeError("Site URL path must not contain traversal segments.");
    }
    url.pathname = `${url.pathname.replace(/\/{2,}/gu, "/").replace(/\/?$/u, "/")}`;
    return url;
}
/** Resolve a normalized content route under the configured site base path. */
export function resolveSiteUrl(siteUrl, route) {
    const base = normalizeSiteBase(siteUrl);
    const normalizedRoute = normalizeSeoRoute(route);
    return serializePublicUrl(new URL(normalizedRoute.slice(1), base));
}
/** Resolve an explicit or generated canonical URL. Relative canonicals stay under the site base. */
export function resolveCanonical(input) {
    const base = normalizeSiteBase(input.siteUrl);
    const pageUrl = new URL(resolveSiteUrl(base, input.route));
    const value = input.canonical?.trim();
    let canonical;
    if (!value) {
        canonical = pageUrl;
    }
    else if (value.startsWith("/")) {
        canonical = new URL(normalizeSeoRoute(value).slice(1), base);
    }
    else {
        canonical = new URL(value, pageUrl);
    }
    assertHttpUrl(canonical, "Canonical");
    if (canonical.hash) {
        throw new TypeError("Canonical URL must not contain a fragment.");
    }
    return serializePublicUrl(canonical);
}
/** Whether a URL is hosted outside the configured origin or base path. */
export function canonicalBelongsToSite(canonical, siteUrl) {
    const candidate = new URL(canonical.toString());
    const base = normalizeSiteBase(siteUrl);
    assertHttpUrl(candidate, "Canonical");
    if (candidate.origin !== base.origin) {
        return false;
    }
    const basePath = base.pathname;
    return basePath === "/" || candidate.pathname === basePath.slice(0, -1) || candidate.pathname.startsWith(basePath);
}
export function isExternalCanonical(canonical, siteUrl) {
    return !canonicalBelongsToSite(canonical, siteUrl);
}
function requireText(value, label) {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new TypeError(`${label} must not be empty.`);
    }
    return trimmed;
}
function resolveMediaUrl(siteUrl, route, value) {
    const trimmed = value.trim();
    if (trimmed.startsWith("/")) {
        return resolveSiteUrl(siteUrl, trimmed);
    }
    const url = new URL(trimmed, resolveSiteUrl(siteUrl, route));
    assertHttpUrl(url, "Open Graph image");
    return serializePublicUrl(url);
}
export function buildMetadata(input) {
    const title = requireText(input.title, "Metadata title");
    const description = requireText(input.description, "Metadata description");
    const canonical = resolveCanonical(input);
    const image = input.image ? resolveMediaUrl(input.siteUrl, input.route, input.image) : undefined;
    return {
        title,
        description,
        canonical,
        openGraph: {
            title,
            description,
            url: canonical,
            type: input.openGraphType ?? "website",
            ...(image ? { image } : {}),
        },
        noindex: input.noindex ?? false,
    };
}
/** Render the one canonical metadata set expected in a page head. */
export function renderMetadataTags(metadata) {
    const lines = [
        `<title>${escapeXml(metadata.title)}</title>`,
        `<meta name="description" content="${escapeXml(metadata.description)}">`,
        `<link rel="canonical" href="${escapeXml(metadata.canonical)}">`,
        `<meta property="og:title" content="${escapeXml(metadata.openGraph.title)}">`,
        `<meta property="og:description" content="${escapeXml(metadata.openGraph.description)}">`,
        `<meta property="og:url" content="${escapeXml(metadata.openGraph.url)}">`,
        `<meta property="og:type" content="${escapeXml(metadata.openGraph.type)}">`,
    ];
    if (metadata.openGraph.image) {
        lines.push(`<meta property="og:image" content="${escapeXml(metadata.openGraph.image)}">`);
    }
    if (metadata.noindex) {
        lines.push('<meta name="robots" content="noindex,follow">');
    }
    return lines.join("\n");
}
//# sourceMappingURL=metadata.js.map