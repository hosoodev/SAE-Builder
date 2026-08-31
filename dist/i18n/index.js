import { normalizeSlug } from "../routing/index.js";
import { escapeXml, resolveSiteUrl } from "../seo/index.js";
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
export function validateI18nConfig(config) {
    if (!config.defaultLocale.trim())
        throw new TypeError("defaultLocale must not be empty.");
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
export function localizeRoute(route, locale, config) {
    validateI18nConfig(config);
    if (!config.locales.includes(locale))
        throw new TypeError(`Unknown locale: ${locale}`);
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
export function createTranslationAlternates(pages, siteUrl, config) {
    validateI18nConfig(config);
    const groups = new Map();
    const seenRoutes = new Set();
    for (const page of pages) {
        if (!config.locales.includes(page.locale)) {
            throw new TypeError(`Page ${page.route} uses unknown locale ${page.locale}.`);
        }
        const route = normalizeSlug(page.route);
        if (seenRoutes.has(route))
            throw new TypeError(`Duplicate localized route: ${route}`);
        seenRoutes.add(route);
        if (!page.translationKey)
            continue;
        const group = groups.get(page.translationKey) ?? [];
        if (group.some((candidate) => candidate.locale === page.locale)) {
            throw new TypeError(`translationKey ${page.translationKey} has more than one ${page.locale} page.`);
        }
        group.push({ ...page, route });
        groups.set(page.translationKey, group);
    }
    const result = new Map();
    for (const group of groups.values()) {
        const ordered = [...group].sort((left, right) => config.locales.indexOf(left.locale) - config.locales.indexOf(right.locale)
            || compareText(left.route, right.route));
        const defaultPage = ordered.find((page) => page.locale === config.defaultLocale);
        const alternatives = ordered.map((page) => ({
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
        for (const page of ordered)
            result.set(page.route, alternatives);
    }
    return result;
}
export function renderHreflangTags(alternatives) {
    return alternatives
        .map(({ hreflang, url }) => `<link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(url)}">`)
        .join("\n");
}
//# sourceMappingURL=index.js.map