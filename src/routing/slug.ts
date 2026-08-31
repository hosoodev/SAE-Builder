import path from "node:path";

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const WINDOWS_FORBIDDEN_CHARACTER = /[<>:"|*]/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/i;

export class RouteError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RouteError";
    this.code = code;
  }
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

function failSlug(slug: string, reason: string): never {
  throw new RouteError("INVALID_SLUG", `Invalid slug ${JSON.stringify(slug)}: ${reason}`);
}

function validateSegment(segment: string, slug: string): void {
  if (segment === "." || segment === "..") {
    failSlug(slug, "dot and traversal segments are not allowed");
  }

  if (segment.endsWith(".") || segment.endsWith(" ")) {
    failSlug(slug, "segments ending in a dot or space are not portable");
  }

  if (WINDOWS_FORBIDDEN_CHARACTER.test(segment)) {
    failSlug(slug, "the route contains a character that is not portable across filesystems");
  }

  if (WINDOWS_RESERVED_NAME.test(segment)) {
    failSlug(slug, `the segment ${JSON.stringify(segment)} is a reserved filename`);
  }
}

/**
 * Normalize a site-local URL path without ever accepting a filesystem path.
 * Encoded separators are rejected so two textual routes cannot map to a
 * surprising directory hierarchy after URL decoding.
 */
export function normalizeSlug(input: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new RouteError("INVALID_SLUG", "A slug must be a non-empty string");
  }

  if (input !== input.trim()) failSlug(input, "surrounding whitespace is not allowed");
  if (!input.startsWith("/")) failSlug(input, "it must start with '/'");
  if (input.includes("?") || input.includes("#") || input.includes("\\")) {
    failSlug(input, "query strings, fragments, and backslashes are not allowed");
  }
  if (CONTROL_CHARACTER.test(input)) failSlug(input, "control characters are not allowed");
  if (ENCODED_PATH_SEPARATOR.test(input)) failSlug(input, "encoded path separators are not allowed");

  let decoded: string;
  try {
    decoded = decodeURIComponent(input).normalize("NFC");
  } catch {
    failSlug(input, "it contains malformed percent encoding");
  }

  if (decoded.includes("?") || decoded.includes("#") || decoded.includes("\\")) {
    failSlug(input, "encoded query, fragment, or backslash characters are not allowed");
  }
  if (CONTROL_CHARACTER.test(decoded)) failSlug(input, "encoded control characters are not allowed");

  const segments = decoded.split("/").filter(Boolean);
  for (const segment of segments) validateSegment(segment, input);

  if (segments.length === 0) return "/";

  const pathname = `/${segments.join("/")}`;
  const lastSegment = segments.at(-1) ?? "";
  const isExplicitFile = path.posix.extname(lastSegment).length > 0;
  return pathname;
}

export function isExplicitFileSlug(slug: string): boolean {
  const normalized = normalizeSlug(slug);
  if (normalized === "/") return false;
  const lastSegment = normalized.split("/").at(-1) ?? "";
  return path.posix.extname(lastSegment).length > 0;
}

export function outputPathForSlug(
  outputRoot: string,
  slug: string,
  trailingSlash = true,
): string {
  const normalized = normalizeSlug(slug);
  const root = path.resolve(outputRoot);
  const relativeRoute = normalized.slice(1);
  const routeSegments = relativeRoute.split("/").filter(Boolean);
  const target = normalized === "/"
    ? path.resolve(root, "index.html")
    : isExplicitFileSlug(normalized)
      ? path.resolve(root, ...routeSegments)
      : trailingSlash
        ? path.resolve(root, ...routeSegments, "index.html")
        : path.resolve(
            root,
            ...routeSegments.slice(0, -1),
            (routeSegments.at(-1) ?? "") + ".html",
          );

  const relativeTarget = path.relative(root, target);
  if (relativeTarget === "" || relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
    throw new RouteError(
      "OUTPUT_ROOT_ESCAPE",
      `The route ${JSON.stringify(normalized)} resolves outside the output root`,
    );
  }

  return target;
}

export function createPageRoute(
  outputRoot: string,
  slug: string,
  trailingSlash = true,
): PageRoute {
  const normalized = normalizeSlug(slug);
  return {
    slug: normalized,
    outputPath: outputPathForSlug(outputRoot, normalized, trailingSlash),
    isExplicitFile: isExplicitFileSlug(normalized),
  };
}

export function assertUniqueSlugs<T>(
  entries: readonly T[],
  getSlug: (entry: T) => string,
  getLabel: (entry: T) => string = () => "content entry",
): void {
  const seen = new Map<string, string>();

  for (const entry of entries) {
    const normalized = normalizeSlug(getSlug(entry));
    const previous = seen.get(normalized);
    if (previous !== undefined) {
      throw new RouteError(
        "DUPLICATE_SLUG",
        `Duplicate normalized slug ${JSON.stringify(normalized)}: ${previous} and ${getLabel(entry)}`,
      );
    }
    seen.set(normalized, getLabel(entry));
  }
}

export function resolveCanonical(
  siteUrl: string,
  slug: string,
  explicitCanonical?: string,
): ResolvedCanonical {
  let site: URL;
  try {
    site = new URL(siteUrl);
  } catch {
    throw new RouteError("INVALID_SITE_URL", `Invalid site URL: ${JSON.stringify(siteUrl)}`);
  }

  if (site.protocol !== "https:" && site.protocol !== "http:") {
    throw new RouteError("INVALID_SITE_URL", "The site URL must use http or https");
  }

  site.pathname = `${site.pathname.replace(/\/{2,}/gu, "/").replace(/\/?$/u, "/")}`;
  site.search = "";
  site.hash = "";

  const normalized = normalizeSlug(slug);
  let canonical: URL;
  try {
    if (explicitCanonical === undefined) {
      canonical = new URL(normalized.slice(1), site);
    } else if (explicitCanonical.startsWith("/")) {
      canonical = new URL(normalizeSlug(explicitCanonical).slice(1), site);
    } else {
      canonical = new URL(explicitCanonical, new URL(normalized.slice(1), site));
    }
  } catch {
    throw new RouteError(
      "INVALID_CANONICAL",
      `Invalid canonical URL: ${JSON.stringify(explicitCanonical)}`,
    );
  }

  if (canonical.protocol !== "https:" && canonical.protocol !== "http:") {
    throw new RouteError("INVALID_CANONICAL", "Canonical URLs must use http or https");
  }

  return {
    url: canonical.href,
    external: canonical.origin !== site.origin
      || (site.pathname !== "/"
        && canonical.pathname !== site.pathname.slice(0, -1)
        && !canonical.pathname.startsWith(site.pathname)),
  };
}
