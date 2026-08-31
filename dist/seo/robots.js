import { resolveSiteUrl } from "./metadata.js";
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function values(value) {
    return value === undefined ? [] : typeof value === "string" ? [value] : value;
}
function directiveValue(value, label) {
    const trimmed = value.trim();
    if (!trimmed || /[\r\n]/u.test(trimmed)) {
        throw new TypeError(`${label} must be a non-empty single line.`);
    }
    return trimmed;
}
/** Generate robots.txt with merged user-agent groups and stable directive ordering. */
export function generateRobotsTxt(options) {
    const groups = new Map();
    const configuredRules = options.preview
        ? [{ userAgent: "*", disallow: "/" }]
        : options.rules ?? [{ userAgent: "*", allow: "/" }];
    for (const rule of configuredRules) {
        const userAgent = directiveValue(rule.userAgent, "Robots user-agent");
        const group = groups.get(userAgent) ?? { allow: new Set(), disallow: new Set() };
        for (const allow of values(rule.allow)) {
            group.allow.add(directiveValue(allow, `Allow rule for ${userAgent}`));
        }
        for (const disallow of values(rule.disallow)) {
            group.disallow.add(directiveValue(disallow, `Disallow rule for ${userAgent}`));
        }
        groups.set(userAgent, group);
    }
    const lines = [];
    const sortedGroups = [...groups.entries()].sort(([left], [right]) => compareText(left, right));
    for (const [index, [userAgent, group]] of sortedGroups.entries()) {
        if (index > 0)
            lines.push("");
        lines.push(`User-agent: ${userAgent}`);
        for (const allow of [...group.allow].sort(compareText))
            lines.push(`Allow: ${allow}`);
        for (const disallow of [...group.disallow].sort(compareText))
            lines.push(`Disallow: ${disallow}`);
    }
    const sitemapUrls = options.sitemapUrls?.map((value) => {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
            throw new TypeError(`Sitemap URL must be absolute HTTP(S): ${value}`);
        }
        return url.href;
    }) ?? [resolveSiteUrl(options.siteUrl, options.sitemapPath ?? "/sitemap.xml")];
    const uniqueSitemaps = [...new Set(sitemapUrls)].sort(compareText);
    if (lines.length > 0 && uniqueSitemaps.length > 0)
        lines.push("");
    for (const sitemap of uniqueSitemaps)
        lines.push(`Sitemap: ${sitemap}`);
    const comments = [...new Set(options.comments?.map((value) => directiveValue(value, "Robots comment")) ?? [])].sort(compareText);
    if (lines.length > 0 && comments.length > 0)
        lines.push("");
    for (const comment of comments)
        lines.push(`#${comment}`);
    return `${lines.join("\n")}\n`;
}
//# sourceMappingURL=robots.js.map