import { type RenderTemplateOptions, type TemplateData, type TemplateRenderResult } from "./engine.js";
export type TemplateKind = "layout" | "partial";
export interface LoadedTemplate {
    kind: TemplateKind;
    name: string;
    id: string;
    path: string;
    content: string;
}
export interface TemplateLoaderOptions {
    root: string;
    layoutsDirectory?: string;
    partialsDirectory?: string;
    extension?: string;
    cache?: boolean;
}
export type LayoutRenderOptions = Omit<RenderTemplateOptions, "partials" | "resolvePartial" | "rootDependencyId" | "templateName">;
export declare class FileTemplateLoader {
    #private;
    readonly root: string;
    readonly layoutsRoot: string;
    readonly partialsRoot: string;
    readonly extension: string;
    readonly cacheEnabled: boolean;
    constructor(options: TemplateLoaderOptions);
    clearCache(): void;
    invalidate(templatePath?: string): void;
    loadLayout(name: string): Promise<LoadedTemplate>;
    loadPartial(name: string): Promise<LoadedTemplate>;
    renderLayout(name: string, data: TemplateData, options?: LayoutRenderOptions): Promise<TemplateRenderResult>;
}
//# sourceMappingURL=loader.d.ts.map