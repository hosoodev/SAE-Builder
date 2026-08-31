import path from "node:path";

import {
  assertSafeRelativePath,
  discoverFiles,
  readTextInside,
  relativeInsideRoot,
} from "../filesystem/index.js";
import {
  renderMarkdown,
  type StaticMdxComponent,
} from "../markdown/index.js";
import {
  assertUniqueSlugs,
  createPageRoute,
  resolveCanonical,
  type PageRoute,
} from "../routing/index.js";
import {
  localizeRoute,
  type I18nRoutingConfig,
} from "../i18n/index.js";
import {
  parseFrontMatter,
  validateFrontMatter,
  type CoreFrontMatter,
} from "./frontmatter.js";
import {
  normalizeCollectionDefinitions,
  type CollectionConfig,
  type ContentCollectionDefinition,
} from "./collection.js";

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

export class ContentLoadError extends Error {
  readonly sourcePath?: string;

  constructor(message: string, sourcePath?: string, cause?: unknown) {
    super(sourcePath === undefined ? message : `${sourcePath}: ${message}`, { cause });
    this.name = "ContentLoadError";
    this.sourcePath = sourcePath;
  }
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function formatForPath(filePath: string): ContentFormat {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".md") return "markdown";
  if (extension === ".mdx") return "mdx";
  throw new ContentLoadError("Only .md and .mdx content files are supported", filePath);
}

function derivedCollection(relativePath: string): string | undefined {
  const segments = relativePath.split("/");
  return segments.length > 1 ? segments[0] : undefined;
}

function matchesDirectory(relativePath: string, directory: string): boolean {
  return relativePath.startsWith(`${directory}/`);
}

function collectionForPath(
  sourceRelativePath: string,
  frontmatter: CoreFrontMatter,
  definitions: readonly ContentCollectionDefinition[],
): ContentCollectionDefinition | undefined {
  if (definitions.length === 0) return undefined;
  const requested = frontmatter.collection;
  if (requested && !definitions.some(({ name }) => name === requested)) {
    throw new ContentLoadError(
      `Unknown collection '${requested}'. Configured collections: ${definitions.map(({ name }) => name).join(", ")}.`,
      sourceRelativePath,
    );
  }

  const mapped = definitions
    .filter(({ directory, name }) => matchesDirectory(sourceRelativePath, directory ?? name))
    .sort((left, right) =>
      (right.directory ?? right.name).length - (left.directory ?? left.name).length
      || left.name.localeCompare(right.name, "en"),
    )[0];
  if (!mapped) {
    if (!requested && !sourceRelativePath.includes("/")) return undefined;
    throw new ContentLoadError(
      "Content file is not inside a configured collection directory.",
      sourceRelativePath,
    );
  }
  if (requested && requested !== mapped.name) {
    throw new ContentLoadError(
      `Collection '${requested}' does not match directory mapping '${mapped.directory}' for '${mapped.name}'.`,
      sourceRelativePath,
    );
  }
  return mapped;
}

function schemaErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
    return error.issues.map((issue) => {
      if (!issue || typeof issue !== "object") return String(issue);
      const record = issue as { path?: unknown; message?: unknown };
      const pathLabel = Array.isArray(record.path) && record.path.length > 0
        ? record.path.join(".")
        : "frontmatter";
      return `${pathLabel}: ${String(record.message ?? "Invalid value")}`;
    }).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

function validateCollectionSchema(
  frontmatter: CoreFrontMatter,
  definition: ContentCollectionDefinition | undefined,
  sourcePath: string,
): CoreFrontMatter {
  if (!definition) return frontmatter;
  const input: CoreFrontMatter = { ...frontmatter, collection: definition.name };
  if (!definition.schema) return input;

  let parsed: unknown;
  try {
    parsed = definition.schema.parse(input);
  } catch (error) {
    throw new ContentLoadError(
      `Collection schema '${definition.name}' rejected front matter: ${schemaErrorMessage(error)}`,
      sourcePath,
      error,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ContentLoadError(
      `Collection schema '${definition.name}' must return a front matter object.`,
      sourcePath,
    );
  }
  try {
    return validateFrontMatter({ ...input, ...parsed, collection: definition.name }, sourcePath);
  } catch (error) {
    throw new ContentLoadError(
      `Collection schema '${definition.name}' produced invalid core front matter: ${schemaErrorMessage(error)}`,
      sourcePath,
      error,
    );
  }
}

function contentDependencies(
  relativePath: string,
  frontmatter: CoreFrontMatter,
): readonly string[] {
  const dependencies = new Set<string>([`content:${relativePath}`]);
  if (frontmatter.layout !== undefined) dependencies.add(`template:${frontmatter.layout}`);
  for (const script of frontmatter.scripts ?? []) dependencies.add(`asset:${script}`);
  for (const style of frontmatter.styles ?? []) dependencies.add(`asset:${style}`);
  if (frontmatter.image !== undefined) dependencies.add(`asset:${frontmatter.image}`);
  return [...dependencies];
}

export async function discoverContentFiles(contentRoot: string): Promise<readonly string[]> {
  return discoverFiles(path.resolve(contentRoot), { extensions: [".md", ".mdx"] });
}

export async function loadContentFile(
  inputPath: string,
  options: ContentFileLoadOptions,
): Promise<NormalizedContentEntry | undefined> {
  const contentRoot = path.resolve(options.contentRoot);
  const sourceRelativePath = toPosixPath(assertSafeRelativePath(inputPath, "content entry"));
  const sourcePath = path.resolve(contentRoot, ...sourceRelativePath.split("/"));
  const format = formatForPath(sourcePath);

  let source: string;
  try {
    source = await readTextInside(contentRoot, sourceRelativePath);
  } catch (error) {
    throw new ContentLoadError(
      `Unable to read content file: ${error instanceof Error ? error.message : String(error)}`,
      sourcePath,
      error,
    );
  }

  const parsed = parseFrontMatter(source, sourcePath);
  const definitions = normalizeCollectionDefinitions(options.collections ?? []);
  const collectionDefinition = collectionForPath(
    sourceRelativePath,
    parsed.frontmatter,
    definitions,
  );
  let frontmatter = validateCollectionSchema(parsed.frontmatter, collectionDefinition, sourcePath);
  if (options.production === true && frontmatter.draft === true && options.includeDraft !== true) {
    return undefined;
  }

  if (options.i18n) {
    const locale = frontmatter.locale ?? options.i18n.defaultLocale;
    if (!options.i18n.locales.includes(locale)) {
      throw new ContentLoadError(
        `Unknown locale '${locale}'. Configured locales: ${options.i18n.locales.join(", ")}.`,
        sourcePath,
      );
    }
    frontmatter = { ...frontmatter, locale };
  }
  const publicSlug = options.i18n
    ? localizeRoute(frontmatter.slug, frontmatter.locale ?? options.i18n.defaultLocale, options.i18n)
    : frontmatter.slug;
  const route = createPageRoute(options.outputRoot, publicSlug, options.trailingSlash);
  frontmatter = { ...frontmatter, slug: route.slug };
  const rendered = await renderMarkdown(parsed.body, {
    format,
    allowRawHtml: options.allowRawHtml,
    components: options.mdxComponents,
    sourcePath,
  });
  const canonical = resolveCanonical(options.siteUrl, route.slug, frontmatter.canonical);
  const collection = collectionDefinition?.name ?? frontmatter.collection ?? derivedCollection(sourceRelativePath);
  const excludedFromDiscovery = frontmatter.noindex === true || canonical.external;

  return {
    sourcePath,
    sourceRelativePath,
    collection,
    format,
    frontmatter,
    rawBody: parsed.body,
    renderedBody: rendered.html,
    route,
    canonical: canonical.url,
    externalCanonical: canonical.external,
    assetReferences: {
      scripts: [...(frontmatter.scripts ?? [])],
      styles: [...(frontmatter.styles ?? [])],
      ...(frontmatter.image === undefined ? {} : { image: frontmatter.image }),
    },
    dependencyIds: contentDependencies(sourceRelativePath, frontmatter),
    includeInSitemap: !excludedFromDiscovery,
    includeInFeed: !excludedFromDiscovery,
  };
}

export async function loadContent(
  options: ContentLoadOptions,
): Promise<readonly NormalizedContentEntry[]> {
  const files = await discoverContentFiles(options.contentRoot);
  const contentRoot = path.resolve(options.contentRoot);
  const collections = normalizeCollectionDefinitions(options.collections ?? []);
  const loaded = await Promise.all(files.map((filePath) => loadContentFile(
    relativeInsideRoot(contentRoot, filePath),
    { ...options, collections },
  )));
  const entries = loaded.filter((entry): entry is NormalizedContentEntry => entry !== undefined);
  entries.sort((left, right) => left.sourceRelativePath.localeCompare(right.sourceRelativePath, "en"));
  assertUniqueSlugs(entries, (entry) => entry.route.slug, (entry) => entry.sourcePath);
  return entries;
}
