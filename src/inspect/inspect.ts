import { parse } from "parse5";

import {
  check,
  type BuildOptions,
  type BuildResult,
  type BuiltPage,
} from "../build/index.js";
import { BuilderError } from "../core/index.js";
import { normalizeSlug } from "../routing/index.js";

interface AstAttribute {
  readonly name: string;
  readonly value: string;
}

interface AstNode {
  readonly nodeName: string;
  readonly tagName?: string;
  readonly value?: string;
  readonly attrs?: readonly AstAttribute[];
  readonly childNodes?: readonly AstNode[];
}

export interface InspectHreflangAlternative {
  readonly hreflang: string;
  readonly href: string;
}

export interface InspectReport {
  readonly source: string;
  readonly route: string;
  readonly layout: string | null;
  readonly partials: readonly string[];
  readonly canonical: string;
  readonly locale: string | null;
  readonly hreflangAlternatives: readonly InspectHreflangAlternative[];
  readonly jsonLd: readonly unknown[];
  readonly dependencies: readonly string[];
  readonly assets: {
    readonly css: readonly string[];
    readonly js: readonly string[];
  };
}

export type InspectOptions = Omit<BuildOptions, "write">;

export type NormalizedInspectTarget =
  | { readonly kind: "route"; readonly route: string }
  | { readonly kind: "url"; readonly url: string; readonly pathname: string };

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function attribute(node: AstNode, name: string): string | undefined {
  return node.attrs?.find(item => item.name === name)?.value;
}

function elementNodes(root: AstNode, tagName: string): AstNode[] {
  const matches: AstNode[] = [];
  const visit = (node: AstNode): void => {
    if (node.tagName === tagName) matches.push(node);
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(root);
  return matches;
}

function nodeText(node: AstNode): string {
  if (node.nodeName === "#text") return node.value ?? "";
  return (node.childNodes ?? []).map(nodeText).join("");
}

function normalizedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedJson);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort(compareText).map(key => [key, normalizedJson(record[key])]),
    );
  }
  return value;
}

function hasRel(node: AstNode, expected: string): boolean {
  return (attribute(node, "rel") ?? "")
    .toLowerCase()
    .split(/\s+/u)
    .includes(expected);
}

export function normalizeInspectTarget(input: string): NormalizedInspectTarget {
  if (typeof input !== "string" || !input || input !== input.trim()) {
    throw new BuilderError("PATH_INVALID", "Inspect target must be a non-empty route or HTTP(S) URL without surrounding whitespace.");
  }
  if (/^https?:\/\//iu.test(input)) {
    let url: URL;
    try {
      url = new URL(input);
    } catch (cause) {
      throw new BuilderError("PATH_INVALID", `Invalid inspect URL: ${JSON.stringify(input)}.`, { cause });
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new BuilderError("PATH_INVALID", "Inspect URLs cannot contain credentials, a query string, or a fragment.");
    }
    const pathname = normalizeSlug(url.pathname);
    url.pathname = pathname;
    return { kind: "url", url: url.href, pathname };
  }
  try {
    return { kind: "route", route: normalizeSlug(input) };
  } catch (cause) {
    throw new BuilderError("PATH_INVALID", `Invalid inspect route: ${JSON.stringify(input)}.`, { cause });
  }
}

function pageForTarget(result: BuildResult, target: NormalizedInspectTarget): BuiltPage | undefined {
  if (target.kind === "route") return result.pages.find(page => page.route === target.route);
  return result.pages.find(page => {
    try {
      const canonical = new URL(page.canonical);
      return canonical.origin === new URL(target.url).origin
        && normalizeSlug(canonical.pathname) === target.pathname;
    } catch {
      return false;
    }
  });
}

export function inspectBuiltPage(page: BuiltPage): InspectReport {
  const document = parse(page.html) as unknown as AstNode;
  const links = elementNodes(document, "link");
  const canonical = links.find(link => hasRel(link, "canonical"));
  const canonicalHref = canonical ? attribute(canonical, "href") : undefined;
  if (!canonicalHref) {
    throw new BuilderError("CHECK_FAILED", `Cannot inspect ${page.route}: rendered HTML has no canonical link.`);
  }

  const html = elementNodes(document, "html")[0];
  const hreflangAlternatives = links
    .filter(link => hasRel(link, "alternate") && attribute(link, "hreflang") && attribute(link, "href"))
    .map(link => ({
      hreflang: attribute(link, "hreflang") ?? "",
      href: attribute(link, "href") ?? "",
    }))
    .sort((left, right) => compareText(left.hreflang, right.hreflang) || compareText(left.href, right.href));
  const jsonLd = elementNodes(document, "script")
    .filter(script => (attribute(script, "type") ?? "").toLowerCase() === "application/ld+json")
    .map(script => {
      try {
        return normalizedJson(JSON.parse(nodeText(script)) as unknown);
      } catch (cause) {
        throw new BuilderError("CHECK_FAILED", `Cannot inspect ${page.route}: rendered JSON-LD is invalid.`, { cause });
      }
    });
  const dependencies = uniqueSorted(page.dependencies);
  const layouts = dependencies.filter(value => value.startsWith("template:")).map(value => value.slice("template:".length));
  const partials = dependencies.filter(value => value.startsWith("partial:")).map(value => value.slice("partial:".length));
  const css = links
    .filter(link => hasRel(link, "stylesheet"))
    .map(link => attribute(link, "href") ?? "")
    .filter(Boolean);
  const js = elementNodes(document, "script")
    .map(script => attribute(script, "src") ?? "")
    .filter(Boolean);

  return Object.freeze({
    source: page.source,
    route: page.route,
    layout: layouts[0] ?? null,
    partials: Object.freeze(uniqueSorted(partials)),
    canonical: canonicalHref,
    locale: html ? attribute(html, "lang") ?? null : null,
    hreflangAlternatives: Object.freeze(hreflangAlternatives),
    jsonLd: Object.freeze(jsonLd),
    dependencies: Object.freeze(dependencies),
    assets: Object.freeze({
      css: Object.freeze(uniqueSorted(css)),
      js: Object.freeze(uniqueSorted(js)),
    }),
  });
}

export function inspectBuildResult(result: BuildResult, requestedTarget: string): InspectReport {
  const target = normalizeInspectTarget(requestedTarget);
  const page = pageForTarget(result, target);
  if (!page) {
    throw new BuilderError(
      "INSPECT_NOT_FOUND",
      `No built page matches inspect target ${JSON.stringify(requestedTarget)}.`,
      { details: { availableRoutes: result.pages.map(item => item.route).sort(compareText) } },
    );
  }
  return inspectBuiltPage(page);
}

export async function inspect(requestedTarget: string, options: InspectOptions = {}): Promise<InspectReport> {
  const result = await check({ ...options, mode: options.mode ?? "production" });
  return inspectBuildResult(result, requestedTarget);
}
