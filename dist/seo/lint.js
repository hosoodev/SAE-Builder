import { parse } from "parse5";
import { serializePublicUrl } from "../core/url.js";
import { canonicalBelongsToSite, normalizeSeoRoute, normalizeSiteBase, resolveCanonical, resolveSiteUrl, } from "./metadata.js";
const DEFAULT_TITLE_GUIDANCE = { max: 60 };
const DEFAULT_DESCRIPTION_GUIDANCE = { min: 50, max: 160 };
const ANSWER_ELEMENTS = new Set(["p", "ul", "ol", "table", "dl"]);
const PAGE_SCHEMA_TYPES = new Set(["WebPage", "Article", "WebApplication", "FAQPage"]);
const QUESTION_PATTERN = /(?:\?|무엇(?:인가요|입니까)?|어떻게|왜|언제|어디|누구|차이는|방법|^(?:what|how|why|when|where|who|which|can|does|do|is|are|should)\b)/iu;
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function compileSimpleGlobs(patterns, caseInsensitive) {
    return [...new Set(patterns ?? [])]
        .sort(compareText)
        .map((pattern) => {
        const source = pattern
            .split("*")
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
            .join(".*");
        return {
            pattern,
            expression: new RegExp(`^${source}$`, caseInsensitive ? "iu" : "u"),
        };
    });
}
function diagnosticLocation(node) {
    return {
        ...(node.sourceCodeLocation?.startLine ? { line: node.sourceCodeLocation.startLine } : {}),
        ...(node.sourceCodeLocation?.startCol ? { column: node.sourceCodeLocation.startCol } : {}),
    };
}
function pushDiagnostic(target, page, ruleId, severity, message, node) {
    target.push({
        ruleId,
        severity,
        message,
        ...(page.source ? { source: page.source } : {}),
        ...(page.route ? { route: page.route } : {}),
        ...(node ? diagnosticLocation(node) : {}),
    });
}
function walk(node, visit) {
    visit(node);
    for (const child of node.childNodes ?? [])
        walk(child, visit);
}
function isElement(node) {
    return typeof node.tagName === "string";
}
function attribute(node, name) {
    const normalized = name.toLowerCase();
    return node.attrs?.find((item) => item.name.toLowerCase() === normalized)?.value;
}
function tokens(value) {
    return value?.toLowerCase().split(/\s+/u).filter(Boolean) ?? [];
}
function directives(value) {
    return value?.toLowerCase().split(/[\s,]+/u).filter(Boolean) ?? [];
}
function nodeText(node, visibleOnly = false) {
    if (node.nodeName === "#text")
        return node.value ?? "";
    if (visibleOnly && ["script", "style", "template"].includes(node.tagName ?? ""))
        return "";
    return (node.childNodes ?? []).map((child) => nodeText(child, visibleOnly)).join("");
}
function normalizedText(value) {
    return value.replace(/\s+/gu, " ").trim();
}
function textLength(value) {
    return [...value].length;
}
function checkLength(target, page, ruleId, label, value, guidance, node) {
    const length = textLength(value);
    if (guidance.min !== undefined && length < guidance.min) {
        pushDiagnostic(target, page, ruleId, "warning", `${label} has ${length} characters; configured minimum is ${guidance.min}.`, node);
    }
    if (guidance.max !== undefined && length > guidance.max) {
        pushDiagnostic(target, page, ruleId, "warning", `${label} has ${length} characters; configured maximum is ${guidance.max}.`, node);
    }
}
function jsonObjects(value) {
    if (Array.isArray(value))
        return value.flatMap(jsonObjects);
    if (!value || typeof value !== "object")
        return [];
    const object = value;
    const graph = Array.isArray(object["@graph"]) ? object["@graph"].flatMap(jsonObjects) : [];
    return [object, ...graph];
}
function schemaTypes(value) {
    return typeof value === "string"
        ? [value]
        : Array.isArray(value)
            ? value.filter((item) => typeof item === "string")
            : [];
}
function schemaEntityUrl(object) {
    if (typeof object.url === "string")
        return object.url;
    const main = object.mainEntityOfPage;
    if (typeof main === "string")
        return main;
    if (main && typeof main === "object" && typeof main["@id"] === "string") {
        return main["@id"];
    }
    return undefined;
}
function visibleFaqMatches(schema, visibleText) {
    const entities = schema.mainEntity;
    if (!Array.isArray(entities))
        return false;
    const haystack = normalizedText(visibleText).toLocaleLowerCase("und");
    return entities.length > 0 && entities.every((entity) => {
        if (!entity || typeof entity !== "object")
            return false;
        const question = entity;
        const accepted = question.acceptedAnswer;
        const answer = accepted && typeof accepted === "object"
            ? accepted.text
            : undefined;
        return (typeof question.name === "string" &&
            typeof answer === "string" &&
            haystack.includes(normalizedText(question.name).toLocaleLowerCase("und")) &&
            haystack.includes(normalizedText(answer).toLocaleLowerCase("und")));
    });
}
function analyzePage(page, options) {
    const diagnostics = [];
    let route;
    try {
        route = normalizeSeoRoute(page.route);
        if (route !== page.route) {
            pushDiagnostic(diagnostics, page, "seo/route-not-normalized", "error", `Route must be normalized as ${route}.`);
        }
    }
    catch (error) {
        pushDiagnostic(diagnostics, page, "seo/route-invalid", "error", error instanceof Error ? error.message : "Route is invalid.");
    }
    const document = parse(page.html, { sourceCodeLocationInfo: true });
    const elements = [];
    walk(document, (node) => {
        if (isElement(node))
            elements.push(node);
    });
    const forbiddenElements = compileSimpleGlobs(options.forbiddenElements, true);
    const forbiddenClasses = compileSimpleGlobs(options.forbiddenClasses, false);
    for (const element of elements) {
        const elementPattern = forbiddenElements.find(({ expression }) => expression.test(element.tagName ?? ""));
        if (elementPattern) {
            pushDiagnostic(diagnostics, page, "html/forbidden-element", "error", `Element <${element.tagName}> is forbidden by pattern ${JSON.stringify(elementPattern.pattern)}.`, element);
        }
        for (const className of attribute(element, "class")?.split(/\s+/u).filter(Boolean) ?? []) {
            const classPattern = forbiddenClasses.find(({ expression }) => expression.test(className));
            if (classPattern) {
                pushDiagnostic(diagnostics, page, "html/forbidden-class", "error", `Class ${JSON.stringify(className)} is forbidden by pattern ${JSON.stringify(classPattern.pattern)}.`, element);
            }
        }
    }
    const byTag = (tagName) => elements.filter((element) => element.tagName === tagName);
    const titles = byTag("title");
    let titleText;
    if (titles.length === 0) {
        pushDiagnostic(diagnostics, page, "seo/title-missing", "error", "Page must contain exactly one non-empty title element.");
    }
    else if (titles.length > 1) {
        pushDiagnostic(diagnostics, page, "seo/title-duplicate", "error", `Page contains ${titles.length} title elements.`, titles[1]);
    }
    else {
        const title = normalizedText(nodeText(titles[0]));
        if (!title)
            pushDiagnostic(diagnostics, page, "seo/title-missing", "error", "Title must not be empty.", titles[0]);
        else {
            titleText = title;
            checkLength(diagnostics, page, "seo/title-length", "Title", title, options.titleLength ?? DEFAULT_TITLE_GUIDANCE, titles[0]);
        }
    }
    const descriptions = elements.filter((element) => element.tagName === "meta" && attribute(element, "name")?.toLowerCase() === "description");
    let descriptionText;
    if (descriptions.length === 0) {
        pushDiagnostic(diagnostics, page, "seo/description-missing", "error", "Page must contain exactly one non-empty meta description.");
    }
    else if (descriptions.length > 1) {
        pushDiagnostic(diagnostics, page, "seo/description-duplicate", "error", `Page contains ${descriptions.length} meta descriptions.`, descriptions[1]);
    }
    else {
        const description = normalizedText(attribute(descriptions[0], "content") ?? "");
        if (!description)
            pushDiagnostic(diagnostics, page, "seo/description-missing", "error", "Meta description must not be empty.", descriptions[0]);
        else {
            descriptionText = description;
            checkLength(diagnostics, page, "seo/description-length", "Description", description, options.descriptionLength ?? DEFAULT_DESCRIPTION_GUIDANCE, descriptions[0]);
        }
    }
    const canonicalElements = elements.filter((element) => element.tagName === "link" && tokens(attribute(element, "rel")).includes("canonical"));
    let canonical;
    if (canonicalElements.length === 0) {
        pushDiagnostic(diagnostics, page, "seo/canonical-missing", "error", "Page must contain exactly one absolute canonical URL.");
    }
    else if (canonicalElements.length > 1) {
        pushDiagnostic(diagnostics, page, "seo/canonical-duplicate", "error", `Page contains ${canonicalElements.length} canonical links.`, canonicalElements[1]);
    }
    else {
        const href = attribute(canonicalElements[0], "href")?.trim() ?? "";
        try {
            if (!/^https?:\/\//iu.test(href))
                throw new TypeError("Canonical URL is not absolute.");
            const parsed = new URL(href);
            if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password || parsed.hash) {
                throw new TypeError("Canonical URL must be HTTP(S), credential-free, and fragment-free.");
            }
            canonical = serializePublicUrl(parsed);
            if (route) {
                const expected = resolveCanonical({ siteUrl: options.siteUrl, route, canonical: page.canonical });
                if (expected !== canonical) {
                    pushDiagnostic(diagnostics, page, "seo/canonical-mismatch", "error", `Rendered canonical ${canonical} does not match metadata canonical ${expected}.`, canonicalElements[0]);
                }
            }
            const base = normalizeSiteBase(options.siteUrl);
            if (parsed.origin === base.origin && !canonicalBelongsToSite(parsed, base)) {
                pushDiagnostic(diagnostics, page, "seo/canonical-base-escape", "error", `Canonical ${canonical} escapes the configured site base.`, canonicalElements[0]);
            }
        }
        catch (error) {
            pushDiagnostic(diagnostics, page, "seo/canonical-invalid", "error", error instanceof Error ? error.message : "Canonical URL is invalid.", canonicalElements[0]);
        }
    }
    const ogProperties = ["og:title", "og:description", "og:url", "og:type"];
    for (const property of ogProperties) {
        const matching = elements.filter((element) => element.tagName === "meta" && attribute(element, "property")?.toLowerCase() === property);
        if (matching.length === 0) {
            pushDiagnostic(diagnostics, page, `seo/${property.replace(":", "-")}-missing`, "error", `Page is missing ${property} metadata.`);
        }
        else if (matching.length > 1) {
            pushDiagnostic(diagnostics, page, `seo/${property.replace(":", "-")}-duplicate`, "error", `Page contains duplicate ${property} metadata.`, matching[1]);
        }
        else {
            const content = normalizedText(attribute(matching[0], "content") ?? "");
            if (!content) {
                pushDiagnostic(diagnostics, page, `seo/${property.replace(":", "-")}-missing`, "error", `${property} content must not be empty.`, matching[0]);
            }
            else if (property === "og:url" && canonical && content !== canonical) {
                pushDiagnostic(diagnostics, page, "seo/og-url-mismatch", "error", "og:url must equal the page canonical.", matching[0]);
            }
            else if (property === "og:title" && titleText && content !== titleText) {
                pushDiagnostic(diagnostics, page, "seo/og-title-mismatch", "error", "og:title must equal the page title.", matching[0]);
            }
            else if (property === "og:description" && descriptionText && content !== descriptionText) {
                pushDiagnostic(diagnostics, page, "seo/og-description-mismatch", "error", "og:description must equal the page description.", matching[0]);
            }
        }
    }
    const headings = elements.filter((element) => /^h[1-6]$/u.test(element.tagName ?? ""));
    const h1Elements = headings.filter((element) => element.tagName === "h1");
    if (h1Elements.length === 0)
        pushDiagnostic(diagnostics, page, "seo/h1-missing", "error", "Page must contain exactly one H1.");
    else if (h1Elements.length > 1)
        pushDiagnostic(diagnostics, page, "seo/h1-multiple", "error", `Page contains ${h1Elements.length} H1 elements.`, h1Elements[1]);
    let previousHeadingLevel;
    for (const heading of headings) {
        const level = Number(heading.tagName?.slice(1));
        if (previousHeadingLevel !== undefined && level > previousHeadingLevel + 1) {
            pushDiagnostic(diagnostics, page, "seo/heading-level-jump", "warning", `Heading level jumps from H${previousHeadingLevel} to H${level}.`, heading);
        }
        previousHeadingLevel = level;
    }
    for (const image of byTag("img")) {
        if (attribute(image, "alt") === undefined) {
            pushDiagnostic(diagnostics, page, "seo/image-alt-missing", "warning", "Image is missing an alt attribute.", image);
        }
    }
    const robots = elements
        .filter((element) => element.tagName === "meta" && attribute(element, "name")?.toLowerCase() === "robots")
        .flatMap((element) => directives(attribute(element, "content")));
    const renderedNoindex = robots.includes("noindex");
    if ((page.noindex ?? false) !== renderedNoindex) {
        pushDiagnostic(diagnostics, page, "seo/noindex-mismatch", "error", `Rendered robots metadata ${renderedNoindex ? "contains" : "does not contain"} noindex, contrary to page metadata.`);
    }
    const answerMinLength = options.answerMinLength ?? 10;
    walk(document, (parent) => {
        const children = parent.childNodes ?? [];
        for (let index = 0; index < children.length; index += 1) {
            const heading = children[index];
            if ((heading.tagName !== "h2" && heading.tagName !== "h3") || !QUESTION_PATTERN.test(normalizedText(nodeText(heading))))
                continue;
            const answer = children.slice(index + 1).find(isElement);
            if (!answer || !ANSWER_ELEMENTS.has(answer.tagName ?? "") || textLength(normalizedText(nodeText(answer, true))) < answerMinLength) {
                pushDiagnostic(diagnostics, page, "aeo/direct-answer-missing", "warning", "Question-like heading needs an immediate meaningful paragraph, list, table, or definition list.", heading);
            }
        }
    });
    const visibleText = nodeText(document, true);
    const jsonScripts = elements.filter((element) => element.tagName === "script" && attribute(element, "type")?.toLowerCase() === "application/ld+json");
    for (const script of jsonScripts) {
        let parsed;
        try {
            parsed = JSON.parse(nodeText(script));
        }
        catch (error) {
            pushDiagnostic(diagnostics, page, "seo/jsonld-invalid", "error", `JSON-LD is invalid: ${error instanceof Error ? error.message : "parse error"}`, script);
            continue;
        }
        for (const object of jsonObjects(parsed)) {
            const types = schemaTypes(object["@type"]);
            if (canonical && types.some((type) => PAGE_SCHEMA_TYPES.has(type))) {
                const schemaUrl = schemaEntityUrl(object);
                if (schemaUrl) {
                    try {
                        const parsedSchemaUrl = new URL(schemaUrl);
                        if (parsedSchemaUrl.protocol !== "https:" && parsedSchemaUrl.protocol !== "http:")
                            throw new TypeError();
                        if (serializePublicUrl(parsedSchemaUrl) !== canonical) {
                            pushDiagnostic(diagnostics, page, "seo/jsonld-url-mismatch", "error", `JSON-LD page URL ${schemaUrl} does not match canonical ${canonical}.`, script);
                        }
                    }
                    catch {
                        pushDiagnostic(diagnostics, page, "seo/jsonld-url-invalid", "error", `JSON-LD page URL is not absolute: ${schemaUrl}`, script);
                    }
                }
            }
            if (types.includes("FAQPage") && !visibleFaqMatches(object, visibleText)) {
                pushDiagnostic(diagnostics, page, "aeo/faq-content-mismatch", "error", "FAQPage questions and answers must match visible page content.", script);
            }
            if (types.includes("Article") && typeof object.dateModified === "string" && object.dateModified !== page.updated) {
                pushDiagnostic(diagnostics, page, "aeo/date-modified-metadata", "warning", "Article dateModified must come from matching explicit updated metadata.", script);
            }
        }
    }
    const links = [];
    for (const anchor of byTag("a")) {
        const href = attribute(anchor, "href");
        if (href !== undefined)
            links.push({ href, ...diagnosticLocation(anchor) });
        if (href && attribute(anchor, "target")?.toLowerCase() === "_blank") {
            try {
                const target = new URL(href, route ? resolveSiteUrl(options.siteUrl, route) : normalizeSiteBase(options.siteUrl));
                if (!canonicalBelongsToSite(target, options.siteUrl) && !tokens(attribute(anchor, "rel")).includes("noopener")) {
                    pushDiagnostic(diagnostics, page, "seo/external-link-rel", "warning", "External target=_blank link should include rel=noopener.", anchor);
                }
            }
            catch {
                // Invalid hrefs are reported by the site-level link pass.
            }
        }
    }
    const ids = new Set(elements.map((element) => attribute(element, "id")).filter((value) => Boolean(value)));
    const alternates = new Map();
    for (const link of elements.filter((element) => element.tagName === "link" && tokens(attribute(element, "rel")).includes("alternate"))) {
        const language = attribute(link, "hreflang")?.toLowerCase();
        const href = attribute(link, "href");
        if (!language || !href)
            continue;
        if (alternates.has(language)) {
            pushDiagnostic(diagnostics, page, "seo/hreflang-duplicate", "error", `Duplicate hreflang ${language}.`, link);
        }
        else {
            try {
                const absolute = new URL(href);
                if (absolute.protocol !== "https:" && absolute.protocol !== "http:")
                    throw new TypeError();
                alternates.set(language, serializePublicUrl(absolute));
            }
            catch {
                pushDiagnostic(diagnostics, page, "seo/hreflang-invalid", "error", `hreflang ${language} must use an absolute HTTP(S) URL.`, link);
            }
        }
        if (options.locales && language !== "x-default" && !options.locales.includes(language)) {
            pushDiagnostic(diagnostics, page, "seo/hreflang-locale-invalid", "error", `hreflang locale ${language} is not configured.`, link);
        }
    }
    return { input: page, route, canonical, diagnostics, links, ids, alternates };
}
function urlToSitePath(url, siteUrl) {
    const base = normalizeSiteBase(siteUrl);
    if (url.origin !== base.origin || !canonicalBelongsToSite(url, base))
        return undefined;
    if (url.pathname === base.pathname.slice(0, -1))
        return "/";
    const relative = url.pathname.slice(base.pathname.length);
    let route = `/${relative}`;
    if (route.endsWith("/index.html"))
        route = route.slice(0, -"/index.html".length);
    return normalizeSeoRoute(route);
}
function addSiteDiagnostics(analyses, options, output) {
    const routes = new Map();
    const canonicals = new Map();
    for (const analysis of analyses) {
        if (analysis.route) {
            const previous = routes.get(analysis.route);
            if (previous) {
                pushDiagnostic(output, analysis.input, "seo/route-duplicate", "error", `Route ${analysis.route} is also used by ${previous.input.source ?? previous.input.route}.`);
            }
            else
                routes.set(analysis.route, analysis);
        }
        if (analysis.canonical) {
            const previous = canonicals.get(analysis.canonical);
            if (previous) {
                pushDiagnostic(output, analysis.input, "seo/canonical-conflict", "error", `Canonical ${analysis.canonical} is also used by ${previous.input.source ?? previous.input.route}.`);
            }
            else
                canonicals.set(analysis.canonical, analysis);
        }
    }
    const knownPaths = new Set();
    for (const path of options.knownPaths ?? []) {
        try {
            knownPaths.add(normalizeSeoRoute(path));
        }
        catch { /* Invalid known paths cannot satisfy a link. */ }
    }
    const inbound = new Set();
    for (const analysis of analyses) {
        if (!analysis.route)
            continue;
        const pageUrl = resolveSiteUrl(options.siteUrl, analysis.route);
        for (const link of analysis.links) {
            const href = link.href.trim();
            if (!href)
                continue;
            let url;
            try {
                url = new URL(href, pageUrl);
            }
            catch {
                pushDiagnostic(output, analysis.input, "link/url-invalid", "error", `Link URL is invalid: ${href}`);
                continue;
            }
            if (["mailto:", "tel:"].includes(url.protocol))
                continue;
            if (url.protocol !== "https:" && url.protocol !== "http:") {
                pushDiagnostic(output, analysis.input, "link/scheme-invalid", "error", `Link uses an unsupported URL scheme: ${href}`);
                continue;
            }
            const base = normalizeSiteBase(options.siteUrl);
            if (url.origin !== base.origin)
                continue;
            if (!canonicalBelongsToSite(url, base)) {
                output.push({
                    ruleId: "link/site-base-escape",
                    severity: "error",
                    message: `Internal link escapes the configured site base: ${href}`,
                    ...(analysis.input.source ? { source: analysis.input.source } : {}),
                    route: analysis.input.route,
                    ...(link.line ? { line: link.line } : {}),
                    ...(link.column ? { column: link.column } : {}),
                });
                continue;
            }
            let targetRoute;
            try {
                targetRoute = urlToSitePath(url, base) ?? "";
            }
            catch {
                pushDiagnostic(output, analysis.input, "link/url-invalid", "error", `Internal link path is invalid: ${href}`);
                continue;
            }
            const target = routes.get(targetRoute);
            if (!target && !knownPaths.has(targetRoute)) {
                pushDiagnostic(output, analysis.input, "link/broken-internal", "error", `Internal link target does not exist: ${href}`);
                continue;
            }
            if (target && targetRoute !== analysis.route)
                inbound.add(targetRoute);
            if (target && url.hash && !url.hash.startsWith("#:~:text=")) {
                let fragment;
                try {
                    fragment = decodeURIComponent(url.hash.slice(1));
                }
                catch {
                    fragment = url.hash.slice(1);
                }
                if (fragment && !target.ids.has(fragment)) {
                    pushDiagnostic(output, analysis.input, "link/broken-fragment", "error", `Fragment #${fragment} does not exist on ${targetRoute}.`);
                }
            }
        }
    }
    const entries = new Set((options.entryRoutes ?? ["/"]).map((route) => normalizeSeoRoute(route)));
    for (const [route, analysis] of routes) {
        if (!entries.has(route) && !inbound.has(route) && !analysis.input.noindex) {
            pushDiagnostic(output, analysis.input, "link/orphan-page", "warning", `Page ${route} has no incoming internal link.`);
        }
    }
    if (options.locales?.length) {
        for (const analysis of analyses) {
            if (!analysis.route || !analysis.canonical || !analysis.input.locale)
                continue;
            for (const [language, href] of analysis.alternates) {
                if (language === "x-default")
                    continue;
                const target = analyses.find((candidate) => candidate.canonical === href);
                if (target && target.alternates.get(analysis.input.locale) !== analysis.canonical) {
                    pushDiagnostic(output, analysis.input, "seo/hreflang-not-reciprocal", "error", `hreflang ${language} target does not link back with ${analysis.input.locale}.`);
                }
            }
        }
    }
}
function applySettings(diagnostics, options) {
    return diagnostics.flatMap((diagnostic) => {
        const setting = options.rules?.[diagnostic.ruleId];
        if (setting === "off")
            return [];
        const severity = setting ?? (options.warningAsError && diagnostic.severity === "warning" ? "error" : diagnostic.severity);
        return [{ ...diagnostic, severity }];
    });
}
export function sortDiagnostics(diagnostics) {
    const severityRank = { error: 0, warning: 1 };
    return [...diagnostics].sort((left, right) => compareText(left.route ?? "", right.route ?? "") ||
        compareText(left.source ?? "", right.source ?? "") ||
        severityRank[left.severity] - severityRank[right.severity] ||
        compareText(left.ruleId, right.ruleId) ||
        (left.line ?? 0) - (right.line ?? 0) ||
        (left.column ?? 0) - (right.column ?? 0) ||
        compareText(left.message, right.message));
}
/** Diagnose one rendered page without assuming that linked pages are available. */
export function diagnoseHtmlPage(page, options) {
    if (page.draft)
        return [];
    const analysis = analyzePage(page, options);
    return sortDiagnostics(applySettings(analysis.diagnostics, options));
}
/** Diagnose rendered HTML, cross-page canonical/route conflicts, links, fragments, and orphans. */
export function diagnoseSeoSite(pages, options) {
    const analyses = pages
        .filter((page) => !page.draft)
        .map((page) => analyzePage(page, options))
        .sort((left, right) => compareText(left.route ?? left.input.route, right.route ?? right.input.route) ||
        compareText(left.input.source ?? "", right.input.source ?? ""));
    const diagnostics = analyses.flatMap((analysis) => analysis.diagnostics);
    addSiteDiagnostics(analyses, options, diagnostics);
    return sortDiagnostics(applySettings(diagnostics, options));
}
//# sourceMappingURL=lint.js.map