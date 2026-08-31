export type TemplateValue = string | number | boolean | bigint | null | undefined;
export type TemplateData = Readonly<Record<string, unknown>>;

export interface PartialTemplateSource {
  name: string;
  content: string;
  dependencyId?: string;
}

export type PartialResolver = (
  name: string,
) => PartialTemplateSource | undefined | Promise<PartialTemplateSource | undefined>;

export interface RenderTemplateOptions {
  partials?: Readonly<Record<string, string>>;
  resolvePartial?: PartialResolver;
  strictVariables?: boolean;
  templateName?: string;
  rootDependencyId?: string;
  maxPartialDepth?: number;
}

export interface TemplateRenderResult {
  html: string;
  dependencies: readonly string[];
}

export class TemplateError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TemplateError";
    this.code = code;
  }
}

const PARTIAL_PATTERN = /\{\{>\s*([A-Za-z0-9_./-]+)\s*\}\}/g;
const VARIABLE_TOKEN_PATTERN = /\{\{\{\s*([A-Za-z0-9_$.-]+)\s*\}\}\}|\{\{\s*([A-Za-z0-9_$.-]+)\s*\}\}/g;
const SAFE_PARTIAL_NAME = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const FORBIDDEN_PROPERTY = new Set(["__proto__", "prototype", "constructor"]);

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readNestedValue(data: TemplateData, dottedPath: string): unknown {
  let value: unknown = data;
  for (const segment of dottedPath.split(".")) {
    if (FORBIDDEN_PROPERTY.has(segment)) return undefined;
    if (typeof value !== "object" || value === null) return undefined;
    if (!Object.prototype.hasOwnProperty.call(value, segment)) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function stringifyTemplateValue(value: unknown, key: string): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
    || typeof value === "bigint"
  ) {
    return String(value);
  }
  throw new TemplateError(
    "UNSUPPORTED_VALUE",
    `Template value ${JSON.stringify(key)} must be a primitive value`,
  );
}

function renderVariables(
  template: string,
  data: TemplateData,
  strictVariables: boolean,
): string {
  const read = (key: string): string => {
    const value = readNestedValue(data, key);
    if (value === undefined && strictVariables) {
      throw new TemplateError("MISSING_VARIABLE", `Missing template variable ${JSON.stringify(key)}`);
    }
    return stringifyTemplateValue(value, key);
  };

  let rendered = "";
  let cursor = 0;
  VARIABLE_TOKEN_PATTERN.lastIndex = 0;

  for (const match of template.matchAll(VARIABLE_TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    const literal = template.slice(cursor, index);
    if (/\{\{/.test(literal)) {
      throw new TemplateError("INVALID_SYNTAX", "Unrecognized or unterminated template expression");
    }
    rendered += literal;
    const rawKey = match[1];
    const escapedKey = match[2];
    rendered += rawKey === undefined ? escapeHtml(read(escapedKey)) : read(rawKey);
    cursor = index + match[0].length;
  }

  const tail = template.slice(cursor);
  if (/\{\{/.test(tail)) {
    throw new TemplateError("INVALID_SYNTAX", "Unrecognized or unterminated template expression");
  }
  rendered += tail;
  return rendered;
}

function assertPartialName(name: string): void {
  if (!SAFE_PARTIAL_NAME.test(name) || name.split("/").some((part) => part === "." || part === "..")) {
    throw new TemplateError("INVALID_PARTIAL", `Invalid partial name ${JSON.stringify(name)}`);
  }
}

async function replacePartials(
  template: string,
  resolver: PartialResolver,
  dependencyIds: Set<string>,
  chain: readonly string[],
  maxDepth: number,
  expandedCache: Map<string, string>,
): Promise<string> {
  let output = "";
  let cursor = 0;
  PARTIAL_PATTERN.lastIndex = 0;
  const matches = [...template.matchAll(PARTIAL_PATTERN)];

  for (const match of matches) {
    const index = match.index ?? 0;
    output += template.slice(cursor, index);
    const partialName = match[1];
    assertPartialName(partialName);

    const source = await resolver(partialName);
    if (source === undefined) {
      throw new TemplateError(
        "MISSING_PARTIAL",
        `Missing partial ${JSON.stringify(partialName)} referenced by ${chain.at(-1) ?? "template"}`,
      );
    }

    const identity = source.dependencyId ?? `partial:${source.name}`;
    if (chain.includes(identity)) {
      throw new TemplateError(
        "PARTIAL_CYCLE",
        `Partial cycle detected: ${[...chain, identity].join(" -> ")}`,
      );
    }
    if (chain.length >= maxDepth) {
      throw new TemplateError(
        "PARTIAL_DEPTH",
        `Partial expansion exceeded the maximum depth of ${maxDepth}`,
      );
    }

    dependencyIds.add(identity);
    let expanded = expandedCache.get(identity);
    if (expanded === undefined) {
      expanded = await replacePartials(
        source.content,
        resolver,
        dependencyIds,
        [...chain, identity],
        maxDepth,
        expandedCache,
      );
      expandedCache.set(identity, expanded);
    }
    output += expanded;
    cursor = index + match[0].length;
  }

  output += template.slice(cursor);
  if (/\{\{>/.test(output)) {
    throw new TemplateError("INVALID_SYNTAX", "Invalid or unterminated partial expression");
  }
  return output;
}

export async function renderTemplate(
  template: string,
  data: TemplateData,
  options: RenderTemplateOptions = {},
): Promise<TemplateRenderResult> {
  const dependencies = new Set<string>();
  if (options.rootDependencyId !== undefined) dependencies.add(options.rootDependencyId);

  const inlinePartials = options.partials ?? {};
  const resolver: PartialResolver = options.resolvePartial ?? ((name) => {
    const content = inlinePartials[name];
    return content === undefined ? undefined : { name, content, dependencyId: `partial:${name}` };
  });

  const rootIdentity = options.rootDependencyId ?? options.templateName ?? "template";
  const expanded = await replacePartials(
    template,
    resolver,
    dependencies,
    [rootIdentity],
    options.maxPartialDepth ?? 64,
    new Map(),
  );

  return {
    html: renderVariables(expanded, data, options.strictVariables ?? false),
    dependencies: [...dependencies],
  };
}
