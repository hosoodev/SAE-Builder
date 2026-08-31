export declare class RouteError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export interface PageRoute {
    slug: string;
    outputPath: string;
    isExplicitFile: boolean;
}
export interface ResolvedCanonical {
    url: string;
    external: boolean;
}
/**
 * Normalize a site-local URL path without ever accepting a filesystem path.
 * Encoded separators are rejected so two textual routes cannot map to a
 * surprising directory hierarchy after URL decoding.
 */
export declare function normalizeSlug(input: string): string;
export declare function isExplicitFileSlug(slug: string): boolean;
export declare function outputPathForSlug(outputRoot: string, slug: string, trailingSlash?: boolean): string;
export declare function createPageRoute(outputRoot: string, slug: string, trailingSlash?: boolean): PageRoute;
export declare function assertUniqueSlugs<T>(entries: readonly T[], getSlug: (entry: T) => string, getLabel?: (entry: T) => string): void;
export declare function resolveCanonical(siteUrl: string, slug: string, explicitCanonical?: string): ResolvedCanonical;
//# sourceMappingURL=slug.d.ts.map