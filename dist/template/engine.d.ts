export type TemplateValue = string | number | boolean | bigint | null | undefined;
export type TemplateData = Readonly<Record<string, unknown>>;
export interface PartialTemplateSource {
    name: string;
    content: string;
    dependencyId?: string;
}
export type PartialResolver = (name: string) => PartialTemplateSource | undefined | Promise<PartialTemplateSource | undefined>;
export interface RenderTemplateOptions {
    partials?: Readonly<Record<string, string>>;
    resolvePartial?: PartialResolver;
    strictVariables?: boolean;
    templateName?: string;
    rootDependencyId?: string;
    maxPartialDepth?: number;
}
export interface TemplateRenderResult {
    html: string;
    dependencies: readonly string[];
}
export declare class TemplateError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function escapeHtml(value: string): string;
export declare function renderTemplate(template: string, data: TemplateData, options?: RenderTemplateOptions): Promise<TemplateRenderResult>;
//# sourceMappingURL=engine.d.ts.map