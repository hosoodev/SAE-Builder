/**
 * Apply a conservative HTML minification pass. Text-node whitespace remains
 * untouched, so prose, inline elements, `pre`, and `textarea` keep their exact
 * semantics. A real HTML tree is used instead of regex-based markup parsing.
 */
export declare function minifyHtmlDocument(html: string): string;
//# sourceMappingURL=html.d.ts.map