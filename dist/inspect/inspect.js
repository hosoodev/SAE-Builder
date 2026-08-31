import { parse } from "parse5";
import { check, } from "../build/index.js";
import { BuilderError } from "../core/index.js";
import { normalizeSlug } from "../routing/index.js";
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function uniqueSorted(values) {
    return [...new Set(values)].sort(compareText);
}
function attribute(node, name) {
    return node.attrs?.find(item => item.name === name)?.value;
}
function elementNodes(root, tagName) {
    const matches = [];
    const visit = (node) => {
        if (node.tagName === tagName)
            matches.push(node);
        for (const child of node.childNodes ?? [])
            visit(child);
    };
    visit(root);
    return matches;
}
function nodeText(node) {
    if (node.nodeName === "#text")
        return node.value ?? "";
    return (node.childNodes ?? []).map(nodeText).join("");
}
function normalizedJson(value) {
    if (Array.isArray(value))
        return value.map(normalizedJson);
    if (value && typeof value === "object") {
        const record = value;
        return Object.fromEntries(Object.keys(record).sort(compareText).map(key => [key, normalizedJson(record[key])]));
    }
    return value;
}
function hasRel(node, expected) {
    return (attribute(node, "rel") ?? "")
        .toLowerCase()
        .split(/\s+/u)
        .includes(expected);
}
export function normalizeInspectTarget(input) {
    if (typeof input !== "string" || !input || input !== input.trim()) {
        throw new BuilderError("PATH_INVALID", "Inspect target must be a non-empty route or HTTP(S) URL without surrounding whitespace.");
    }
    if (/^https?:\/\//iu.test(input)) {
        let url;
        try {
            url = new URL(input);
        }
        catch (cause) {
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
    }
    catch (cause) {
        throw new BuilderError("PATH_INVALID", `Invalid inspect route: ${JSON.stringify(input)}.`, { cause });
    }
}
function pageForTarget(result, target) {
    if (target.kind === "route")
        return result.pages.find(page => page.route === target.route);
    return result.pages.find(page => {
        try {
            const canonical = new URL(page.canonical);
            return canonical.origin === new URL(target.url).origin
                && normalizeSlug(canonical.pathname) === target.pathname;
        }
        catch {
            return false;
        }
    });
}
export function inspectBuiltPage(page) {
    const document = parse(page.html);
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
            return normalizedJson(JSON.parse(nodeText(script)));
        }
        catch (cause) {
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
export function inspectBuildResult(result, requestedTarget) {
    const target = normalizeInspectTarget(requestedTarget);
    const page = pageForTarget(result, target);
    if (!page) {
        throw new BuilderError("INSPECT_NOT_FOUND", `No built page matches inspect target ${JSON.stringify(requestedTarget)}.`, { details: { availableRoutes: result.pages.map(item => item.route).sort(compareText) } });
    }
    return inspectBuiltPage(page);
}
export async function inspect(requestedTarget, options = {}) {
    const result = await check({ ...options, mode: options.mode ?? "production" });
    return inspectBuildResult(result, requestedTarget);
}
//# sourceMappingURL=inspect.js.map