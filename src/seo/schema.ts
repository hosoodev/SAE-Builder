import { serializePublicUrl } from "../core/url.js";

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

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TypeError(`${label} must not be empty.`);
  }
  return trimmed;
}

function absoluteUrl(value: string, label: string): string {
  const url = new URL(value);
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw new TypeError(`${label} must be an absolute HTTP(S) URL without credentials.`);
  }
  return serializePublicUrl(url);
}

function optionalText(value: string | undefined, label: string): string | undefined {
  return value === undefined ? undefined : requireText(value, label);
}

function schemaReference(reference: ThingReference, label: string): JsonLdObject {
  return {
    "@type": "Organization",
    ...(reference.id ? { "@id": absoluteUrl(reference.id, `${label} id`) } : {}),
    name: requireText(reference.name, `${label} name`),
    ...(reference.url ? { url: absoluteUrl(reference.url, `${label} URL`) } : {}),
  };
}

function withContext(type: string, properties: JsonLdObject): JsonLdObject {
  return { "@context": "https://schema.org", "@type": type, ...properties };
}

export function createWebSiteSchema(input: WebSiteSchemaInput): JsonLdObject {
  return withContext("WebSite", {
    name: requireText(input.name, "WebSite name"),
    url: absoluteUrl(input.url, "WebSite URL"),
    ...(input.description ? { description: requireText(input.description, "WebSite description") } : {}),
    ...(input.publisherId ? { publisher: { "@id": absoluteUrl(input.publisherId, "Publisher id") } } : {}),
    ...(input.inLanguage ? { inLanguage: requireText(input.inLanguage, "WebSite language") } : {}),
  });
}

export function createOrganizationSchema(input: OrganizationSchemaInput): JsonLdObject {
  return withContext("Organization", {
    ...(input.id ? { "@id": absoluteUrl(input.id, "Organization id") } : {}),
    name: requireText(input.name, "Organization name"),
    url: absoluteUrl(input.url, "Organization URL"),
    ...(input.logo ? { logo: absoluteUrl(input.logo, "Organization logo") } : {}),
    ...(input.description ? { description: requireText(input.description, "Organization description") } : {}),
  });
}

export function createWebPageSchema(input: WebPageSchemaInput): JsonLdObject {
  return withContext("WebPage", {
    name: requireText(input.name, "WebPage name"),
    description: requireText(input.description, "WebPage description"),
    url: absoluteUrl(input.url, "WebPage URL"),
    ...(input.inLanguage ? { inLanguage: requireText(input.inLanguage, "WebPage language") } : {}),
    ...(input.isPartOfId ? { isPartOf: { "@id": absoluteUrl(input.isPartOfId, "WebSite id") } } : {}),
  });
}

export function createArticleSchema(input: ArticleSchemaInput): JsonLdObject {
  const url = absoluteUrl(input.url, "Article URL");
  return withContext("Article", {
    headline: requireText(input.headline ?? input.name, "Article headline"),
    name: requireText(input.name, "Article name"),
    description: requireText(input.description, "Article description"),
    url,
    mainEntityOfPage: { "@id": url },
    ...(input.inLanguage ? { inLanguage: requireText(input.inLanguage, "Article language") } : {}),
    ...(input.isPartOfId ? { isPartOf: { "@id": absoluteUrl(input.isPartOfId, "WebSite id") } } : {}),
    ...(input.datePublished ? { datePublished: requireText(input.datePublished, "Article publication date") } : {}),
    ...(input.dateModified ? { dateModified: requireText(input.dateModified, "Article modification date") } : {}),
    ...(input.image ? { image: absoluteUrl(input.image, "Article image") } : {}),
    ...(input.author ? { author: { ...schemaReference(input.author, "Article author"), "@type": "Person" } } : {}),
    ...(input.publisher ? { publisher: schemaReference(input.publisher, "Article publisher") } : {}),
  });
}

export function createBreadcrumbListSchema(items: readonly BreadcrumbItemInput[]): JsonLdObject {
  if (items.length === 0) {
    throw new TypeError("BreadcrumbList requires at least one item.");
  }
  return withContext("BreadcrumbList", {
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: requireText(item.name, `Breadcrumb ${index + 1} name`),
      item: absoluteUrl(item.url, `Breadcrumb ${index + 1} URL`),
    })),
  });
}

export function createWebApplicationSchema(input: WebApplicationSchemaInput): JsonLdObject {
  return withContext("WebApplication", {
    name: requireText(input.name, "WebApplication name"),
    description: requireText(input.description, "WebApplication description"),
    url: absoluteUrl(input.url, "WebApplication URL"),
    ...(input.inLanguage ? { inLanguage: requireText(input.inLanguage, "WebApplication language") } : {}),
    ...(input.isPartOfId ? { isPartOf: { "@id": absoluteUrl(input.isPartOfId, "WebSite id") } } : {}),
    ...(input.applicationCategory
      ? { applicationCategory: requireText(input.applicationCategory, "Application category") }
      : {}),
    ...(input.operatingSystem
      ? { operatingSystem: requireText(input.operatingSystem, "Application operating system") }
      : {}),
  });
}

/** FAQ schema is deliberately opt-in and contains only caller-supplied visible Q&A. */
export function createFaqPageSchema(items: readonly FaqItemInput[]): JsonLdObject {
  if (items.length === 0) {
    throw new TypeError("FAQPage requires at least one question and answer.");
  }
  return withContext("FAQPage", {
    mainEntity: items.map((item, index) => ({
      "@type": "Question",
      name: requireText(item.question, `FAQ question ${index + 1}`),
      acceptedAnswer: {
        "@type": "Answer",
        text: requireText(item.answer, `FAQ answer ${index + 1}`),
      },
    })),
  });
}

/** Combine schema nodes without duplicating their schema.org contexts. */
export function createJsonLdGraph(nodes: readonly JsonLdObject[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.map(({ "@context": _context, ...node }) => node),
  };
}

function normalizeJson(value: JsonLdValue, ancestors: Set<object>): JsonLdValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("JSON-LD cannot contain a non-finite number.");
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError("JSON-LD contains an unsupported value.");
  }
  if (ancestors.has(value as object)) {
    throw new TypeError("JSON-LD cannot contain a circular reference.");
  }

  ancestors.add(value as object);
  let normalized: JsonLdValue;
  if (Array.isArray(value)) {
    normalized = value.map((item) => normalizeJson(item, ancestors));
  } else {
    const objectValue = value as JsonLdObject;
    const result: Record<string, JsonLdValue> = {};
    for (const key of Object.keys(objectValue).sort()) {
      const child = objectValue[key];
      if (child !== undefined) {
        result[key] = normalizeJson(child, ancestors);
      }
    }
    normalized = result;
  }
  ancestors.delete(value as object);
  return normalized;
}

/** Deterministic and script-safe JSON serialization for application/ld+json. */
export function serializeJsonLd(value: JsonLdValue): string {
  return JSON.stringify(normalizeJson(value, new Set())).replace(/[<>&\u2028\u2029]/gu, (character) => {
    switch (character) {
      case "<":
        return "\\u003c";
      case ">":
        return "\\u003e";
      case "&":
        return "\\u0026";
      case "\u2028":
        return "\\u2028";
      default:
        return "\\u2029";
    }
  });
}

export function renderJsonLd(value: JsonLdValue): string {
  return `<script type="application/ld+json">${serializeJsonLd(value)}</script>`;
}
