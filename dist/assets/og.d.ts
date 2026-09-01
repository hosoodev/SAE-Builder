export interface OgTemplateData {
    readonly title: string;
    readonly subtitle?: string;
    readonly category?: string;
    readonly siteName?: string;
}
export interface RenderOgSvgOptions {
    readonly width?: number;
    readonly height?: number;
    readonly fontFamily?: string;
    readonly template: string;
}
export interface GenerateOgImageOptions extends RenderOgSvgOptions {
    readonly outputDirectory: string;
    readonly cacheDirectory: string;
    readonly publicPath?: string;
    readonly filenameStem?: string;
    readonly format?: "png" | "webp";
    readonly quality?: number;
}
export interface PlanOgImageOptions extends RenderOgSvgOptions {
    readonly cacheDirectory?: string;
    readonly publicPath?: string;
    readonly filenameStem?: string;
    readonly format?: "png" | "webp";
    readonly quality?: number;
}
export interface PlannedOgImage {
    readonly width: number;
    readonly height: number;
    readonly format: "png" | "webp";
    readonly svgHash: string;
    readonly contentHash: string;
    readonly filename: string;
    readonly url: string;
    readonly contents: Uint8Array;
    readonly cacheHit: boolean;
}
export interface GeneratedOgImage {
    readonly width: number;
    readonly height: number;
    readonly format: "png" | "webp";
    readonly svgHash: string;
    readonly contentHash: string;
    readonly filename: string;
    readonly filePath: string;
    readonly url: string;
    readonly cacheHit: boolean;
}
export declare function renderOgSvg(data: OgTemplateData, options: RenderOgSvgOptions): string;
export declare function generateOgImage(data: OgTemplateData, options: GenerateOgImageOptions): Promise<GeneratedOgImage>;
export declare function planOgImage(data: OgTemplateData, options: PlanOgImageOptions): Promise<PlannedOgImage>;
//# sourceMappingURL=og.d.ts.map