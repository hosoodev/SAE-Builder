import type { NormalizedContentEntry } from "./loader.js";
export interface CollectionSchema<T = unknown> {
    parse(value: unknown): T;
}
export interface ContentCollectionDefinition<T = unknown> {
    readonly name: string;
    readonly directory?: string;
    readonly schema?: CollectionSchema<T>;
}
export type CollectionConfig = string | ContentCollectionDefinition;
export type CollectionFilter<T> = Readonly<Record<string, unknown>> | ((entry: T) => boolean);
export type SortDirection = "asc" | "desc";
export interface PaginationPage<T> {
    readonly items: readonly T[];
    readonly page: number;
    readonly pageSize: number;
    readonly pageCount: number;
    readonly total: number;
    readonly previousPage?: number;
    readonly nextPage?: number;
}
export declare function defineCollection<T>(definition: ContentCollectionDefinition<T>): ContentCollectionDefinition<T>;
/** Normalize legacy names and reject ambiguous collection ownership. */
export declare function normalizeCollectionDefinitions(collections: readonly CollectionConfig[]): readonly ContentCollectionDefinition[];
export declare function paginateItems<T>(items: readonly T[], pageSize: number): readonly PaginationPage<T>[];
export declare class ContentQuery {
    #private;
    constructor(items: readonly NormalizedContentEntry[]);
    where(filter: CollectionFilter<NormalizedContentEntry>): ContentQuery;
    filter(filter: CollectionFilter<NormalizedContentEntry>): ContentQuery;
    sort(field: string, direction?: SortDirection): ContentQuery;
    all(): readonly NormalizedContentEntry[];
    first(): NormalizedContentEntry | undefined;
    count(): number;
    paginate(pageSize: number): readonly PaginationPage<NormalizedContentEntry>[];
    tagIndex(): ReadonlyMap<string, readonly NormalizedContentEntry[]>;
    categoryIndex(): ReadonlyMap<string, readonly NormalizedContentEntry[]>;
    related(target: NormalizedContentEntry, options?: {
        readonly limit?: number;
    }): readonly NormalizedContentEntry[];
}
export declare class ContentRepository {
    #private;
    constructor(entries: readonly NormalizedContentEntry[]);
    collection(name: string): ContentQuery;
    collections(): readonly string[];
    all(): ContentQuery;
}
export declare function createContentRepository(entries: readonly NormalizedContentEntry[]): ContentRepository;
//# sourceMappingURL=collection.d.ts.map