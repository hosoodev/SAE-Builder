export type JsonLdPrimitive = string | number | boolean | null;
export type JsonLdValue = JsonLdPrimitive | JsonLdObject | readonly JsonLdValue[];
export interface JsonLdObject {
    readonly [key: string]: JsonLdValue | undefined;
}
export interface ThingReference {
    readonly id?: string;
    readonly name: string;
    readonly url?: string;
}
export interface WebSiteSchemaInput {
    readonly name: string;
    readonly url: string;
    readonly description?: string;
    readonly publisherId?: string;
    readonly inLanguage?: string;
}
export interface OrganizationSchemaInput {
    readonly name: string;
    readonly url: string;
    readonly id?: string;
    readonly logo?: string;
    readonly description?: string;
}
export interface WebPageSchemaInput {
    readonly name: string;
    readonly description: string;
    readonly url: string;
    readonly inLanguage?: string;
    readonly isPartOfId?: string;
}
export interface ArticleSchemaInput extends WebPageSchemaInput {
    readonly headline?: string;
    readonly datePublished?: string;
    readonly dateModified?: string;
    readonly image?: string;
    readonly author?: ThingReference;
    readonly publisher?: ThingReference;
}
export interface BreadcrumbItemInput {
    readonly name: string;
    readonly url: string;
}
export interface WebApplicationSchemaInput extends WebPageSchemaInput {
    readonly applicationCategory?: string;
    readonly operatingSystem?: string;
}
export interface FaqItemInput {
    readonly question: string;
    readonly answer: string;
}
export declare function createWebSiteSchema(input: WebSiteSchemaInput): JsonLdObject;
export declare function createOrganizationSchema(input: OrganizationSchemaInput): JsonLdObject;
export declare function createWebPageSchema(input: WebPageSchemaInput): JsonLdObject;
export declare function createArticleSchema(input: ArticleSchemaInput): JsonLdObject;
export declare function createBreadcrumbListSchema(items: readonly BreadcrumbItemInput[]): JsonLdObject;
export declare function createWebApplicationSchema(input: WebApplicationSchemaInput): JsonLdObject;
/** FAQ schema is deliberately opt-in and contains only caller-supplied visible Q&A. */
export declare function createFaqPageSchema(items: readonly FaqItemInput[]): JsonLdObject;
/** Combine schema nodes without duplicating their schema.org contexts. */
export declare function createJsonLdGraph(nodes: readonly JsonLdObject[]): JsonLdObject;
/** Deterministic and script-safe JSON serialization for application/ld+json. */
export declare function serializeJsonLd(value: JsonLdValue): string;
export declare function renderJsonLd(value: JsonLdValue): string;
//# sourceMappingURL=schema.d.ts.map