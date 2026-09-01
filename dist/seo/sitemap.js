import { canonicalBelongsToSite, resolveCanonical } from "./metadata.js";
import { escapeXml } from "./xml.js";
import { serializePublicUrl } from "../core/url.js";
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
export const SITEMAP_MAX_URLS = 50_000;
const CHANGE_FREQUENCIES = new Set([
    "always", "hourly", "daily", "weekly", "monthly", "yearly", "never",
]);
export function validateSeoDate(value, label = "Date") {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
        throw new TypeError(`${label} must use YYYY-MM-DD.`);
    }
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day) {
        throw new TypeError(`${label} is not a real calendar date.`);
    }
    return value;
}
function sitemapUrl(page, siteUrl) {
    if (page.draft || page.noindex || page.redirect) {
        return undefined;
    }
    const canonical = resolveCanonical({ siteUrl, route: page.route, canonical: page.canonical });
    return canonicalBelongsToSite(canonical, siteUrl) ? canonical : undefined;
}
/** Generate one deterministic sitemap document. Draft/noindex/redirect/external-canonical pages are omitted. */
export function generateSitemap(pages, options) {
    const entries = pages.flatMap((page) => {
        const url = sitemapUrl(page, options.siteUrl);
        if (!url) {
            return [];
        }
        if (page.sitemap?.priority !== undefined) {
            const priority = page.sitemap.priority;
            if (!Number.isFinite(priority) || priority < 0 || priority > 1) {
                throw new TypeError(`Sitemap priority for ${page.route} must be between 0 and 1.`);
            }
        }
        if (page.sitemap?.changefreq !== undefined && !CHANGE_FREQUENCIES.has(page.sitemap.changefreq)) {
            throw new TypeError(`Invalid sitemap changefreq for ${page.route}: ${page.sitemap.changefreq}`);
        }
        return [{ page, url }];
    });
    const maxUrls = options.maxUrls ?? SITEMAP_MAX_URLS;
    if (!Number.isInteger(maxUrls) || maxUrls < 1 || maxUrls > SITEMAP_MAX_URLS) {
        throw new TypeError(`Sitemap maxUrls must be an integer between 1 and ${SITEMAP_MAX_URLS}.`);
    }
    if (entries.length > maxUrls) {
        throw new RangeError(`Sitemap contains ${entries.length} URLs; split it at ${maxUrls} URLs and generate a sitemap index.`);
    }
    entries.sort((left, right) => compareText(left.url, right.url));
    for (let index = 1; index < entries.length; index += 1) {
        if (entries[index - 1]?.url === entries[index]?.url) {
            throw new TypeError(`Duplicate sitemap URL: ${entries[index]?.url}`);
        }
    }
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ];
    for (const { page, url } of entries) {
        lines.push("  <url>", `    <loc>${escapeXml(url)}</loc>`);
        if (page.updated) {
            lines.push(`    <lastmod>${escapeXml(validateSeoDate(page.updated, `Updated date for ${page.route}`))}</lastmod>`);
        }
        if (page.sitemap?.changefreq) {
            lines.push(`    <changefreq>${page.sitemap.changefreq}</changefreq>`);
        }
        if (page.sitemap?.priority !== undefined) {
            lines.push(`    <priority>${String(page.sitemap.priority)}</priority>`);
        }
        lines.push("  </url>");
    }
    lines.push("</urlset>");
    return `${lines.join("\n")}\n`;
}
/** Generate a deterministic sitemap index from already-generated absolute sitemap URLs. */
export function generateSitemapIndex(entries) {
    const normalized = entries.map((entry) => {
        const url = new URL(entry.url);
        if ((url.protocol !== "https:" && url.protocol !== "http:") ||
            url.username ||
            url.password ||
            url.hash) {
            throw new TypeError(`Sitemap index URL must be absolute HTTP(S): ${entry.url}`);
        }
        return { url: serializePublicUrl(url), lastmod: entry.lastmod };
    });
    normalized.sort((left, right) => compareText(left.url, right.url));
    for (let index = 1; index < normalized.length; index += 1) {
        if (normalized[index - 1]?.url === normalized[index]?.url) {
            throw new TypeError(`Duplicate sitemap index URL: ${normalized[index]?.url}`);
        }
    }
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ];
    for (const entry of normalized) {
        lines.push("  <sitemap>", `    <loc>${escapeXml(entry.url)}</loc>`);
        if (entry.lastmod) {
            lines.push(`    <lastmod>${escapeXml(validateSeoDate(entry.lastmod, `Last modified date for ${entry.url}`))}</lastmod>`);
        }
        lines.push("  </sitemap>");
    }
    lines.push("</sitemapindex>");
    return `${lines.join("\n")}\n`;
}
//# sourceMappingURL=sitemap.js.map