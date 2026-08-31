type AttributeValue = string | number | boolean;
export interface StaticMdxComponent {
    /** Semantic HTML element emitted for this build-time component. */
    tagName: string;
    /** Literal content attributes accepted from MDX authors. */
    allowedAttributes?: readonly string[];
    /** Trusted, project-owned attributes always included on the element. */
    fixedAttributes?: Readonly<Record<string, AttributeValue>>;
}
export interface MarkdownRenderOptions {
    format?: "markdown" | "mdx";
    allowRawHtml?: boolean;
    components?: Readonly<Record<string, StaticMdxComponent>>;
    sourcePath?: string;
}
export interface MarkdownRenderResult {
    html: string;
}
export declare class MarkdownError extends Error {
    readonly sourcePath?: string;
    constructor(message: string, sourcePath?: string);
}
export declare function renderMarkdown(source: string, options?: MarkdownRenderOptions): Promise<MarkdownRenderResult>;
export {};
//# sourceMappingURL=render.d.ts.map