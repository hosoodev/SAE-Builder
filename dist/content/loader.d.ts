import { type StaticMdxComponent } from "../markdown/index.js";
import { type PageRoute } from "../routing/index.js";
import { type I18nRoutingConfig } from "../i18n/index.js";
import { type CoreFrontMatter } from "./frontmatter.js";
import { type CollectionConfig } from "./collection.js";
export type ContentFormat = "markdown" | "mdx";
export interface ContentAssetReferences {
    scripts: readonly string[];
    styles: readonly string[];
    image?: string;
}
export interface NormalizedContentEntry {
    sourcePath: string;
    sourceRelativePath: string;
    collection?: string;
    format: ContentFormat;
    frontmatter: CoreFrontMatter;
    rawBody: string;
    renderedBody: string;
    route: PageRoute;
    canonical: string;
    externalCanonical: boolean;
    assetReferences: ContentAssetReferences;
    dependencyIds: readonly string[];
    includeInSitemap: boolean;
    includeInFeed: boolean;
}
export interface ContentLoadOptions {
    contentRoot: string;
    outputRoot: string;
    siteUrl: string;
    production?: boolean;
    trailingSlash?: boolean;
    allowRawHtml?: boolean;
    mdxComponents?: Readonly<Record<string, StaticMdxComponent>>;
    collections?: readonly CollectionConfig[];
    i18n?: I18nRoutingConfig;
}
export interface ContentFileLoadOptions extends ContentLoadOptions {
    /** Skip the production draft filter when loading one file for inspection. */
    includeDraft?: boolean;
}
export declare class ContentLoadError extends Error {
    readonly sourcePath?: string;
    constructor(message: string, sourcePath?: string, cause?: unknown);
}
export declare function discoverContentFiles(contentRoot: string): Promise<readonly string[]>;
export declare function loadContentFile(inputPath: string, options: ContentFileLoadOptions): Promise<NormalizedContentEntry | undefined>;
export declare function loadContent(options: ContentLoadOptions): Promise<readonly NormalizedContentEntry[]>;
//# sourceMappingURL=loader.d.ts.map