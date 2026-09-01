import { canonicalBelongsToSite, normalizeSiteBase, resolveCanonical, resolveSiteUrl } from "./metadata.js";
import { validateSeoDate } from "./sitemap.js";
import { escapeXml } from "./xml.js";
import { serializePublicUrl } from "../core/url.js";

export interface RssItemInput {
  readonly route: string;
  readonly title: string;
  readonly description: string;
  readonly canonical?: string;
  readonly date?: string;
  readonly updated?: string;
  readonly author?: string;
  readonly draft?: boolean;
  readonly noindex?: boolean;
  readonly redirect?: boolean;
}

export interface RssOptions {
  readonly siteUrl: string | URL;
  readonly title: string;
  readonly description: string;
  readonly path?: string;
  readonly language?: string;
}

interface ResolvedRssItem extends RssItemInput {
  readonly url: string;
  readonly sortDate?: string;
}

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TypeError(`${label} must not be empty.`);
  }
  return trimmed;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toRfc822(value: string, label: string): string {
  const dateOnly = validateSeoDate(value, label);
  return new Date(`${dateOnly}T00:00:00.000Z`).toUTCString();
}

/** Generate deterministic RSS 2.0. No current build timestamp is synthesized. */
export function generateRss(items: readonly RssItemInput[], options: RssOptions): string {
  const resolved: ResolvedRssItem[] = [];
  for (const item of items) {
    if (item.draft || item.noindex || item.redirect) {
      continue;
    }
    const url = resolveCanonical({ siteUrl: options.siteUrl, route: item.route, canonical: item.canonical });
    if (!canonicalBelongsToSite(url, options.siteUrl)) {
      continue;
    }
    requireText(item.title, `RSS title for ${item.route}`);
    requireText(item.description, `RSS description for ${item.route}`);
    if (item.date) validateSeoDate(item.date, `Publication date for ${item.route}`);
    if (item.updated) validateSeoDate(item.updated, `Updated date for ${item.route}`);
    resolved.push({ ...item, url, sortDate: item.updated ?? item.date });
  }

  resolved.sort((left, right) => {
    if (left.sortDate !== right.sortDate) {
      if (!left.sortDate) return 1;
      if (!right.sortDate) return -1;
      return compareText(right.sortDate, left.sortDate);
    }
    return compareText(left.url, right.url);
  });
  for (let index = 1; index < resolved.length; index += 1) {
    if (resolved[index - 1]?.url === resolved[index]?.url) {
      throw new TypeError(`Duplicate RSS item URL: ${resolved[index]?.url}`);
    }
  }

  const feedUrl = resolveSiteUrl(options.siteUrl, options.path ?? "/rss.xml");
  const siteUrl = serializePublicUrl(normalizeSiteBase(options.siteUrl));
  const hasAuthor = resolved.some((item) => item.author?.trim());
  const namespace = hasAuthor
    ? ' xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/"'
    : ' xmlns:atom="http://www.w3.org/2005/Atom"';
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rss version="2.0"${namespace}>`,
    "  <channel>",
    `    <title>${escapeXml(requireText(options.title, "RSS title"))}</title>`,
    `    <link>${escapeXml(siteUrl)}</link>`,
    `    <description>${escapeXml(requireText(options.description, "RSS description"))}</description>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
  ];
  if (options.language) {
    lines.push(`    <language>${escapeXml(requireText(options.language, "RSS language"))}</language>`);
  }
  const latest = resolved.find((item) => item.sortDate)?.sortDate;
  if (latest) {
    lines.push(`    <lastBuildDate>${escapeXml(toRfc822(latest, "RSS last build date"))}</lastBuildDate>`);
  }
  for (const item of resolved) {
    lines.push(
      "    <item>",
      `      <title>${escapeXml(item.title.trim())}</title>`,
      `      <link>${escapeXml(item.url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(item.url)}</guid>`,
      `      <description>${escapeXml(item.description.trim())}</description>`,
    );
    if (item.date) {
      lines.push(`      <pubDate>${escapeXml(toRfc822(item.date, `Publication date for ${item.route}`))}</pubDate>`);
    }
    if (item.updated) {
      lines.push(`      <atom:updated>${escapeXml(`${item.updated}T00:00:00.000Z`)}</atom:updated>`);
    }
    if (item.author?.trim()) {
      lines.push(`      <dc:creator>${escapeXml(item.author.trim())}</dc:creator>`);
    }
    lines.push("    </item>");
  }
  lines.push("  </channel>", "</rss>");
  return `${lines.join("\n")}\n`;
}
