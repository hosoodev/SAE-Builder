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
export declare function validateI18nConfig(config: I18nRoutingConfig): void;
/** Turn a locale-neutral content slug into its public locale route. */
export declare function localizeRoute(route: string, locale: string, config: I18nRoutingConfig): string;
/**
 * Build reciprocal hreflang sets for every translationKey group. The map is
 * keyed by each page's already-localized public route.
 */
export declare function createTranslationAlternates(pages: readonly TranslationPage[], siteUrl: string | URL, config: I18nRoutingConfig): ReadonlyMap<string, readonly TranslationAlternative[]>;
export declare function renderHreflangTags(alternatives: readonly TranslationAlternative[]): string;
//# sourceMappingURL=index.d.ts.map