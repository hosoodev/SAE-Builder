import { parse, serialize } from "parse5";
import { normalizeSiteBase } from "../seo/index.js";
const URL_ATTRIBUTES = new Set(["action", "data", "href", "poster", "src"]);
function prefixRootUrl(value, basePath) {
    if (!value.startsWith("/") || value.startsWith("//"))
        return value;
    const prefix = basePath.slice(0, -1);
    if (value === prefix || value.startsWith(`${prefix}/`))
        return value;
    return `${prefix}${value}`;
}
function prefixSrcset(value, basePath) {
    if (/^\s*data:/iu.test(value))
        return value;
    return value.split(",").map((candidate) => {
        const match = /^(\s*)(\S+)(.*)$/u.exec(candidate);
        if (!match)
            return candidate;
        return `${match[1]}${prefixRootUrl(match[2], basePath)}${match[3]}`;
    }).join(",");
}
function rewriteNode(node, basePath) {
    for (const attribute of node.attrs ?? []) {
        if (URL_ATTRIBUTES.has(attribute.name)) {
            attribute.value = prefixRootUrl(attribute.value, basePath);
        }
        else if (attribute.name === "srcset") {
            attribute.value = prefixSrcset(attribute.value, basePath);
        }
    }
    for (const child of node.childNodes ?? [])
        rewriteNode(child, basePath);
    if (node.content)
        rewriteNode(node.content, basePath);
}
/** Prefix site-local absolute HTML attributes when deploying below an origin base path. */
export function applySiteBasePath(html, siteUrl) {
    const basePath = normalizeSiteBase(siteUrl).pathname;
    if (basePath === "/")
        return html;
    const document = parse(html);
    rewriteNode(document, basePath);
    return serialize(document);
}
//# sourceMappingURL=base-path.js.map