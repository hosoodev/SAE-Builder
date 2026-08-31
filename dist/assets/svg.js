export function assertSelfContainedSvg(svg, label = "SVG") {
    if (!/<svg\b/i.test(svg) || /<script\b|<foreignObject\b/i.test(svg)) {
        throw new Error(`${label} must be self-contained SVG without scripts or foreignObject.`);
    }
    const withoutNamespaces = svg.replace(/\sxmlns(?:\:[\w-]+)?=["']http:\/\/www\.w3\.org\/[^"']+["']/gi, "");
    if (/(?:https?:|file:|\\\\|\/\/)/i.test(withoutNamespaces) || /@import\b/i.test(withoutNamespaces)) {
        throw new Error(`${label} cannot reference external URLs or files.`);
    }
}
//# sourceMappingURL=svg.js.map