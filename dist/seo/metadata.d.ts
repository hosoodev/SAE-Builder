export type OpenGraphType = "website" | "article";
export interface CanonicalInput {
    readonly siteUrl: string | URL;
    readonly route: string;
    readonly canonical?: string;
}
export interface MetadataInput extends CanonicalInput {
    readonly title: string;
    readonly description: string;
    readonly image?: string;
    readonly openGraphType?: OpenGraphType;
    readonly noindex?: boolean;
}
export interface ResolvedMetadata {
    readonly title: string;
    readonly description: string;
    readonly canonical: string;
    readonly openGraph: {
        readonly title: string;
        readonly description: string;
        readonly url: string;
        readonly type: OpenGraphType;
        readonly image?: string;
    };
    readonly noindex: boolean;
}
/** Normalize a content route without interpreting it as an origin-relative URL. */
export declare function normalizeSeoRoute(route: string): string;
/** Normalize and validate the configured public site base. */
export declare function normalizeSiteBase(siteUrl: string | URL): URL;
/** Resolve a normalized content route under the configured site base path. */
export declare function resolveSiteUrl(siteUrl: string | URL, route: string): string;
/** Resolve an explicit or generated canonical URL. Relative canonicals stay under the site base. */
export declare function resolveCanonical(input: CanonicalInput): string;
/** Whether a URL is hosted outside the configured origin or base path. */
export declare function canonicalBelongsToSite(canonical: string | URL, siteUrl: string | URL): boolean;
export declare function isExternalCanonical(canonical: string | URL, siteUrl: string | URL): boolean;
export declare function buildMetadata(input: MetadataInput): ResolvedMetadata;
/** Render the one canonical metadata set expected in a page head. */
export declare function renderMetadataTags(metadata: ResolvedMetadata): string;
//# sourceMappingURL=metadata.d.ts.map