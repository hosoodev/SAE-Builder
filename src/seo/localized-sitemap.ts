import {
  canonicalBelongsToSite,
  resolveCanonical,
  resolveSiteUrl,
} from "./metadata.js";
import {
  generateSitemap,
  generateSitemapIndex,
  SITEMAP_MAX_URLS,
  type SitemapPageInput,
} from "./sitemap.js";

export interface LocalizedSitemapPageInput extends SitemapPageInput {
  readonly locale: string;
}

export interface LocalizedSitemapPlanOptions {
  readonly siteUrl: string | URL;
  readonly locales: readonly string[];
  /** Testable split boundary; production callers should use the 50,000 default. */
  readonly maxUrls?: number;
}

export interface PlannedSitemapArtifact {
  readonly relativePath: string;
  readonly contents: string;
  readonly locale?: string;
  readonly index: boolean;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function localeFilename(locale: string): string {
  const value = locale.toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) {
    throw new TypeError(`Locale cannot be used in a sitemap filename: ${locale}`);
  }
  return value;
}

function chunks<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  if (items.length === 0) return [[]];
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size));
}

function latestUpdated(pages: readonly SitemapPageInput[]): string | undefined {
  return pages.flatMap((page) => page.updated ? [page.updated] : []).sort(compareText).at(-1);
}

/** Plan deterministic locale sitemap files and an index whenever grouping or splitting requires it. */
export function planLocalizedSitemaps(
  pages: readonly LocalizedSitemapPageInput[],
  options: LocalizedSitemapPlanOptions,
): readonly PlannedSitemapArtifact[] {
  const maxUrls = options.maxUrls ?? SITEMAP_MAX_URLS;
  if (!Number.isInteger(maxUrls) || maxUrls < 1 || maxUrls > SITEMAP_MAX_URLS) {
    throw new TypeError(`Sitemap maxUrls must be an integer between 1 and ${SITEMAP_MAX_URLS}.`);
  }
  if (options.locales.length === 0) throw new TypeError("At least one sitemap locale is required.");
  const localeKeys = new Map<string, string>();
  for (const locale of options.locales) {
    const token = localeFilename(locale);
    const duplicate = localeKeys.get(token);
    if (duplicate) throw new TypeError(`Duplicate sitemap locale: ${duplicate} and ${locale}.`);
    localeKeys.set(token, locale);
  }

  const groups = new Map(options.locales.map((locale) => [locale, [] as SitemapPageInput[]]));
  const canonicalUrls = new Set<string>();
  for (const page of pages) {
    const group = groups.get(page.locale);
    if (!group) throw new TypeError(`Sitemap page ${page.route} uses unknown locale ${page.locale}.`);
    if (page.draft || page.noindex || page.redirect) continue;
    const canonical = resolveCanonical({
      siteUrl: options.siteUrl,
      route: page.route,
      canonical: page.canonical,
    });
    if (!canonicalBelongsToSite(canonical, options.siteUrl)) continue;
    if (canonicalUrls.has(canonical)) throw new TypeError(`Duplicate sitemap URL: ${canonical}`);
    canonicalUrls.add(canonical);
    group.push(page);
  }
  for (const group of groups.values()) {
    group.sort((left, right) =>
      compareText(left.route, right.route) || compareText(left.canonical ?? "", right.canonical ?? ""));
  }

  const grouped = options.locales.length > 1;
  const sitemapArtifacts: PlannedSitemapArtifact[] = [];
  for (const locale of options.locales) {
    const group = groups.get(locale) ?? [];
    const parts = chunks(group, maxUrls);
    const token = localeFilename(locale);
    for (const [index, part] of parts.entries()) {
      const relativePath = grouped
        ? parts.length === 1
          ? `sitemap-${token}.xml`
          : `sitemap-${token}-${index + 1}.xml`
        : parts.length === 1
          ? "sitemap.xml"
          : `sitemap-${index + 1}.xml`;
      sitemapArtifacts.push({
        relativePath,
        contents: generateSitemap(part, { siteUrl: options.siteUrl, maxUrls }),
        locale,
        index: false,
      });
    }
  }

  if (!grouped && sitemapArtifacts.length === 1) return sitemapArtifacts;
  const indexEntries = sitemapArtifacts.map((artifact) => {
    const group = groups.get(artifact.locale ?? options.locales[0]) ?? [];
    const sameLocale = sitemapArtifacts.filter(({ locale }) => locale === artifact.locale);
    const partIndex = sameLocale.indexOf(artifact);
    const part = chunks(group, maxUrls)[partIndex] ?? [];
    const lastmod = latestUpdated(part);
    return {
      url: resolveSiteUrl(options.siteUrl, `/${artifact.relativePath}`),
      ...(lastmod ? { lastmod } : {}),
    };
  });
  return [
    ...sitemapArtifacts,
    {
      relativePath: "sitemap.xml",
      contents: generateSitemapIndex(indexEntries),
      index: true,
    },
  ];
}
