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
/** Generate deterministic RSS 2.0. No current build timestamp is synthesized. */
export declare function generateRss(items: readonly RssItemInput[], options: RssOptions): string;
//# sourceMappingURL=rss.d.ts.map