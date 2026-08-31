import { type SitemapPageInput } from "./sitemap.js";
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
/** Plan deterministic locale sitemap files and an index whenever grouping or splitting requires it. */
export declare function planLocalizedSitemaps(pages: readonly LocalizedSitemapPageInput[], options: LocalizedSitemapPlanOptions): readonly PlannedSitemapArtifact[];
//# sourceMappingURL=localized-sitemap.d.ts.map