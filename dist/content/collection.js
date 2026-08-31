function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function compareValue(left, right) {
    if (left === right)
        return 0;
    if (left === undefined || left === null)
        return 1;
    if (right === undefined || right === null)
        return -1;
    if (typeof left === "number" && typeof right === "number")
        return left - right;
    return compareText(String(left), String(right));
}
function fieldValue(entry, field) {
    if (field in entry.frontmatter)
        return entry.frontmatter[field];
    return entry[field];
}
function requirePositiveInteger(value, label) {
    if (!Number.isInteger(value) || value < 1) {
        throw new TypeError(`${label} must be a positive integer.`);
    }
}
export function defineCollection(definition) {
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
export function normalizeCollectionDefinitions(collections) {
    const definitions = collections.map((collection) => defineCollection(typeof collection === "string" ? { name: collection, directory: collection } : collection));
    const names = new Map();
    const directories = new Map();
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
            throw new TypeError(`Collection directory ${directory} is mapped by both ${duplicateDirectory} and ${definition.name}.`);
        }
        names.set(nameKey, definition.name);
        directories.set(directoryKey, definition.name);
    }
    return Object.freeze(definitions);
}
export function paginateItems(items, pageSize) {
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
    #items;
    constructor(items) {
        this.#items = [...items];
    }
    where(filter) {
        if (typeof filter === "function")
            return new ContentQuery(this.#items.filter(filter));
        const expected = Object.entries(filter);
        return new ContentQuery(this.#items.filter((entry) => expected.every(([key, value]) => {
            if (key in entry)
                return entry[key] === value;
            return entry.frontmatter[key] === value;
        })));
    }
    filter(filter) {
        return this.where(filter);
    }
    sort(field, direction = "asc") {
        if (!field.trim())
            throw new TypeError("sort field must not be empty.");
        const sign = direction === "asc" ? 1 : -1;
        const items = [...this.#items].sort((left, right) => sign * compareValue(fieldValue(left, field), fieldValue(right, field))
            || compareText(left.route.slug, right.route.slug));
        return new ContentQuery(items);
    }
    all() {
        return [...this.#items];
    }
    first() {
        return this.#items[0];
    }
    count() {
        return this.#items.length;
    }
    paginate(pageSize) {
        return paginateItems(this.#items, pageSize);
    }
    tagIndex() {
        const index = new Map();
        for (const entry of this.#items) {
            for (const tag of entry.frontmatter.tags ?? []) {
                const group = index.get(tag) ?? [];
                group.push(entry);
                index.set(tag, group);
            }
        }
        return new Map([...index.entries()]
            .sort(([left], [right]) => compareText(left, right))
            .map(([tag, entries]) => [tag, [...entries].sort((left, right) => compareText(left.route.slug, right.route.slug))]));
    }
    categoryIndex() {
        const index = new Map();
        for (const entry of this.#items) {
            const category = entry.frontmatter.category;
            if (typeof category !== "string" || !category.trim())
                continue;
            const group = index.get(category) ?? [];
            group.push(entry);
            index.set(category, group);
        }
        return new Map([...index.entries()]
            .sort(([left], [right]) => compareText(left, right))
            .map(([category, entries]) => [category, [...entries].sort((left, right) => compareText(left.route.slug, right.route.slug))]));
    }
    related(target, options = {}) {
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
    #entries;
    constructor(entries) {
        this.#entries = [...entries];
    }
    collection(name) {
        return new ContentQuery(this.#entries.filter((entry) => entry.collection === name));
    }
    collections() {
        return [...new Set(this.#entries.flatMap((entry) => entry.collection ? [entry.collection] : []))]
            .sort(compareText);
    }
    all() {
        return new ContentQuery(this.#entries);
    }
}
export function createContentRepository(entries) {
    return new ContentRepository(entries);
}
//# sourceMappingURL=collection.js.map