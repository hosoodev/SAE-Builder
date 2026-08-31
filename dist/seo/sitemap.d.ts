export type SitemapChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
export interface SitemapPageInput {
    readonly route: string;
    readonly canonical?: string;
    readonly updated?: string;
    readonly draft?: boolean;
    readonly noindex?: boolean;
    readonly redirect?: boolean;
    readonly sitemap?: {
        readonly priority?: number;
        readonly changefreq?: SitemapChangeFrequency;
    };
}
export interface SitemapOptions {
    readonly siteUrl: string | URL;
    /** Override only for testing or a caller that creates its own sitemap index. */
    readonly maxUrls?: number;
}
export interface SitemapIndexEntry {
    readonly url: string;
    readonly lastmod?: string;
}
export declare const SITEMAP_MAX_URLS = 50000;
export declare function validateSeoDate(value: string, label?: string): string;
/** Generate one deterministic sitemap document. Draft/noindex/redirect/external-canonical pages are omitted. */
export declare function generateSitemap(pages: readonly SitemapPageInput[], options: SitemapOptions): string;
/** Generate a deterministic sitemap index from already-generated absolute sitemap URLs. */
export declare function generateSitemapIndex(entries: readonly SitemapIndexEntry[]): string;
//# sourceMappingURL=sitemap.d.ts.map