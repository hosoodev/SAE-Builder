import { normalizeSlug } from "../routing/index.js";
import { escapeXml, resolveSiteUrl } from "../seo/index.js";

export type I18nRoutingMode = "prefix-all" | "prefix-except-default";

export interface I18nRoutingConfig {
  readonly defaultLocale: string;
  readonly locales: readonly string[];
  readonly routing: I18nRoutingMode;
}

export interface TranslationPage {
  readonly route: string;
  readonly locale: string;
  readonly translationKey?: string;
}

export interface TranslationAlternative {
  readonly hreflang: string;
  readonly route: string;
  readonly url: string;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function validateI18nConfig(config: I18nRoutingConfig): void {
  if (!config.defaultLocale.trim()) throw new TypeError("defaultLocale must not be empty.");
  if (!config.locales.includes(config.defaultLocale)) {
    throw new TypeError("locales must include defaultLocale.");
  }
  if (new Set(config.locales.map((locale) => locale.toLowerCase())).size !== config.locales.length) {
    throw new TypeError("locales must not contain duplicates.");
  }
  for (const locale of config.locales) {
    if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(locale)) {
      throw new TypeError(`Invalid locale: ${locale}`);
    }
  }
}

/** Turn a locale-neutral content slug into its public locale route. */
export function localizeRoute(
  route: string,
  locale: string,
  config: I18nRoutingConfig,
): string {
  validateI18nConfig(config);
  if (!config.locales.includes(locale)) throw new TypeError(`Unknown locale: ${locale}`);
  const normalized = normalizeSlug(route);
  if (config.routing === "prefix-except-default" && locale === config.defaultLocale) {
    return normalized;
  }
  return normalizeSlug(`/${locale}${normalized}`);
}

/**
 * Build reciprocal hreflang sets for every translationKey group. The map is
 * keyed by each page's already-localized public route.
 */
export function createTranslationAlternates(
  pages: readonly TranslationPage[],
  siteUrl: string | URL,
  config: I18nRoutingConfig,
): ReadonlyMap<string, readonly TranslationAlternative[]> {
  validateI18nConfig(config);
  const groups = new Map<string, TranslationPage[]>();
  const seenRoutes = new Set<string>();
  for (const page of pages) {
    if (!config.locales.includes(page.locale)) {
      throw new TypeError(`Page ${page.route} uses unknown locale ${page.locale}.`);
    }
    const route = normalizeSlug(page.route);
    if (seenRoutes.has(route)) throw new TypeError(`Duplicate localized route: ${route}`);
    seenRoutes.add(route);
    if (!page.translationKey) continue;
    const group = groups.get(page.translationKey) ?? [];
    if (group.some((candidate) => candidate.locale === page.locale)) {
      throw new TypeError(
        `translationKey ${page.translationKey} has more than one ${page.locale} page.`,
      );
    }
    group.push({ ...page, route });
    groups.set(page.translationKey, group);
  }

  const result = new Map<string, readonly TranslationAlternative[]>();
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) =>
      config.locales.indexOf(left.locale) - config.locales.indexOf(right.locale)
      || compareText(left.route, right.route));
    const defaultPage = ordered.find((page) => page.locale === config.defaultLocale);
    const alternatives: TranslationAlternative[] = ordered.map((page) => ({
      hreflang: page.locale,
      route: page.route,
      url: resolveSiteUrl(siteUrl, page.route),
    }));
    if (defaultPage) {
      alternatives.push({
        hreflang: "x-default",
        route: defaultPage.route,
        url: resolveSiteUrl(siteUrl, defaultPage.route),
      });
    }
    for (const page of ordered) result.set(page.route, alternatives);
  }
  return result;
}

export function renderHreflangTags(
  alternatives: readonly TranslationAlternative[],
): string {
  return alternatives
    .map(({ hreflang, url }) =>
      `<link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(url)}">`)
    .join("\n");
}
