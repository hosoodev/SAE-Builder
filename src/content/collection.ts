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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareValue(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === undefined || left === null) return 1;
  if (right === undefined || right === null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return compareText(String(left), String(right));
}

function fieldValue(entry: NormalizedContentEntry, field: string): unknown {
  if (field in entry.frontmatter) return entry.frontmatter[field];
  return (entry as unknown as Record<string, unknown>)[field];
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
}

export function defineCollection<T>(
  definition: ContentCollectionDefinition<T>,
): ContentCollectionDefinition<T> {
  const name = definition.name.trim();
  if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new TypeError(`Invalid collection name: ${definition.name}`);
  }
  const directory = (definition.directory ?? name).trim().replace(/\/$/u, "");
  if (!directory || directory.startsWith("/") || directory.includes("\\")
    || directory.split("/").some((segment) => !segment || segment === ".." || segment === ".")) {
    throw new TypeError(`Invalid collection directory: ${definition.directory ?? name}`);
  }
  if (definition.schema !== undefined || "schema" in definition) {
    if (!definition.schema || typeof definition.schema.parse !== "function") {
      throw new TypeError(`Invalid schema for collection ${name}: expected a parse function.`);
    }
  }
  return Object.freeze({ ...definition, name, directory });
}

/** Normalize legacy names and reject ambiguous collection ownership. */
export function normalizeCollectionDefinitions(
  collections: readonly CollectionConfig[],
): readonly ContentCollectionDefinition[] {
  const definitions = collections.map((collection) => defineCollection(
    typeof collection === "string" ? { name: collection, directory: collection } : collection,
  ));
  const names = new Map<string, string>();
  const directories = new Map<string, string>();
  for (const definition of definitions) {
    const nameKey = definition.name.normalize("NFC").toLowerCase();
    const directory = definition.directory ?? definition.name;
    const directoryKey = directory.normalize("NFC").toLowerCase();
    const duplicateName = names.get(nameKey);
    if (duplicateName) {
      throw new TypeError(`Duplicate collection name: ${duplicateName} and ${definition.name}.`);
    }
    const duplicateDirectory = directories.get(directoryKey);
    if (duplicateDirectory) {
      throw new TypeError(
        `Collection directory ${directory} is mapped by both ${duplicateDirectory} and ${definition.name}.`,
      );
    }
    names.set(nameKey, definition.name);
    directories.set(directoryKey, definition.name);
  }
  return Object.freeze(definitions);
}

export function paginateItems<T>(
  items: readonly T[],
  pageSize: number,
): readonly PaginationPage<T>[] {
  requirePositiveInteger(pageSize, "pageSize");
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  return Array.from({ length: pageCount }, (_, index) => {
    const page = index + 1;
    return {
      items: items.slice(index * pageSize, page * pageSize),
      page,
      pageSize,
      pageCount,
      total: items.length,
      ...(page > 1 ? { previousPage: page - 1 } : {}),
      ...(page < pageCount ? { nextPage: page + 1 } : {}),
    };
  });
}

export class ContentQuery {
  readonly #items: readonly NormalizedContentEntry[];

  constructor(items: readonly NormalizedContentEntry[]) {
    this.#items = [...items];
  }

  where(filter: CollectionFilter<NormalizedContentEntry>): ContentQuery {
    if (typeof filter === "function") return new ContentQuery(this.#items.filter(filter));
    const expected = Object.entries(filter);
    return new ContentQuery(this.#items.filter((entry) => expected.every(([key, value]) => {
      if (key in entry) return (entry as unknown as Record<string, unknown>)[key] === value;
      return entry.frontmatter[key] === value;
    })));
  }

  filter(filter: CollectionFilter<NormalizedContentEntry>): ContentQuery {
    return this.where(filter);
  }

  sort(field: string, direction: SortDirection = "asc"): ContentQuery {
    if (!field.trim()) throw new TypeError("sort field must not be empty.");
    const sign = direction === "asc" ? 1 : -1;
    const items = [...this.#items].sort((left, right) =>
      sign * compareValue(fieldValue(left, field), fieldValue(right, field))
      || compareText(left.route.slug, right.route.slug));
    return new ContentQuery(items);
  }

  all(): readonly NormalizedContentEntry[] {
    return [...this.#items];
  }

  first(): NormalizedContentEntry | undefined {
    return this.#items[0];
  }

  count(): number {
    return this.#items.length;
  }

  paginate(pageSize: number): readonly PaginationPage<NormalizedContentEntry>[] {
    return paginateItems(this.#items, pageSize);
  }

  tagIndex(): ReadonlyMap<string, readonly NormalizedContentEntry[]> {
    const index = new Map<string, NormalizedContentEntry[]>();
    for (const entry of this.#items) {
      for (const tag of entry.frontmatter.tags ?? []) {
        const group = index.get(tag) ?? [];
        group.push(entry);
        index.set(tag, group);
      }
    }
    return new Map([...index.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([tag, entries]) => [tag, [...entries].sort((left, right) =>
        compareText(left.route.slug, right.route.slug))]));
  }

  categoryIndex(): ReadonlyMap<string, readonly NormalizedContentEntry[]> {
    const index = new Map<string, NormalizedContentEntry[]>();
    for (const entry of this.#items) {
      const category = entry.frontmatter.category;
      if (typeof category !== "string" || !category.trim()) continue;
      const group = index.get(category) ?? [];
      group.push(entry);
      index.set(category, group);
    }
    return new Map([...index.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([category, entries]) => [category, [...entries].sort((left, right) =>
        compareText(left.route.slug, right.route.slug))]));
  }

  related(
    target: NormalizedContentEntry,
    options: { readonly limit?: number } = {},
  ): readonly NormalizedContentEntry[] {
    const limit = options.limit ?? 3;
    requirePositiveInteger(limit, "related limit");
    const targetTags = new Set(target.frontmatter.tags ?? []);
    const targetCategory = typeof target.frontmatter.category === "string"
      ? target.frontmatter.category
      : undefined;
    return this.#items
      .filter((entry) => entry.route.slug !== target.route.slug)
      .map((entry) => ({
        entry,
        score: (entry.frontmatter.tags ?? []).filter((tag) => targetTags.has(tag)).length * 2
          + (targetCategory && entry.frontmatter.category === targetCategory ? 1 : 0),
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score
        || compareValue(right.entry.frontmatter.updated, left.entry.frontmatter.updated)
        || compareText(left.entry.route.slug, right.entry.route.slug))
      .slice(0, limit)
      .map(({ entry }) => entry);
  }
}

export class ContentRepository {
  readonly #entries: readonly NormalizedContentEntry[];

  constructor(entries: readonly NormalizedContentEntry[]) {
    this.#entries = [...entries];
  }

  collection(name: string): ContentQuery {
    return new ContentQuery(this.#entries.filter((entry) => entry.collection === name));
  }

  collections(): readonly string[] {
    return [...new Set(this.#entries.flatMap((entry) => entry.collection ? [entry.collection] : []))]
      .sort(compareText);
  }

  all(): ContentQuery {
    return new ContentQuery(this.#entries);
  }
}

export function createContentRepository(
  entries: readonly NormalizedContentEntry[],
): ContentRepository {
  return new ContentRepository(entries);
}
