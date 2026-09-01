import { serializePublicUrl } from "../core/url.js";
function requireText(value, label) {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new TypeError(`${label} must not be empty.`);
    }
    return trimmed;
}
function absoluteUrl(value, label) {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
        throw new TypeError(`${label} must be an absolute HTTP(S) URL without credentials.`);
    }
    return serializePublicUrl(url);
}
function optionalText(value, label) {
    return value === undefined ? undefined : requireText(value, label);
}
function schemaReference(reference, label) {
    return {
        "@type": "Organization",
        ...(reference.id ? { "@id": absoluteUrl(reference.id, `${label} id`) } : {}),
        name: requireText(reference.name, `${label} name`),
        ...(reference.url ? { url: absoluteUrl(reference.url, `${label} URL`) } : {}),
    };
}
function withContext(type, properties) {
    return { "@context": "https://schema.org", "@type": type, ...properties };
}
export function createWebSiteSchema(input) {
    return withContext("WebSite", {
        name: requireText(input.name, "WebSite name"),
        url: absoluteUrl(input.url, "WebSite URL"),
        ...(input.description ? { description: requireText(input.description, "WebSite description") } : {}),
        ...(input.publisherId ? { publisher: { "@id": absoluteUrl(input.publisherId, "Publisher id") } } : {}),
        ...(input.inLanguage ? { inLanguage: requireText(input.inLanguage, "WebSite language") } : {}),
    });
}
export function createOrganizationSchema(input) {
    return withContext("Organization", {
        ...(input.id ? { "@id": absoluteUrl(input.id, "Organization id") } : {}),
        name: requireText(input.name, "Organization name"),
        url: absoluteUrl(input.url, "Organization URL"),
        ...(input.logo ? { logo: absoluteUrl(input.logo, "Organization logo") } : {}),
        ...(input.description ? { description: requireText(input.description, "Organization description") } : {}),
    });
}
export function createWebPageSchema(input) {
    return withContext("WebPage", {
        name: requireText(input.name, "WebPage name"),
        description: requireText(input.description, "WebPage description"),
        url: absoluteUrl(input.url, "WebPage URL"),
        ...(input.inLanguage ? { inLanguage: requireText(input.inLanguage, "WebPage language") } : {}),
        ...(input.isPartOfId ? { isPartOf: { "@id": absoluteUrl(input.isPartOfId, "WebSite id") } } : {}),
    });
}
export function createArticleSchema(input) {
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
export function createBreadcrumbListSchema(items) {
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
export function createWebApplicationSchema(input) {
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
export function createFaqPageSchema(items) {
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
export function createJsonLdGraph(nodes) {
    return {
        "@context": "https://schema.org",
        "@graph": nodes.map(({ "@context": _context, ...node }) => node),
    };
}
function normalizeJson(value, ancestors) {
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
    if (ancestors.has(value)) {
        throw new TypeError("JSON-LD cannot contain a circular reference.");
    }
    ancestors.add(value);
    let normalized;
    if (Array.isArray(value)) {
        normalized = value.map((item) => normalizeJson(item, ancestors));
    }
    else {
        const objectValue = value;
        const result = {};
        for (const key of Object.keys(objectValue).sort()) {
            const child = objectValue[key];
            if (child !== undefined) {
                result[key] = normalizeJson(child, ancestors);
            }
        }
        normalized = result;
    }
    ancestors.delete(value);
    return normalized;
}
/** Deterministic and script-safe JSON serialization for application/ld+json. */
export function serializeJsonLd(value) {
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
export function renderJsonLd(value) {
    return `<script type="application/ld+json">${serializeJsonLd(value)}</script>`;
}
//# sourceMappingURL=schema.js.map