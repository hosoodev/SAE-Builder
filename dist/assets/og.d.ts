export declare const DEFAULT_OG_SVG_TEMPLATE = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{{width}}\" height=\"{{height}}\" viewBox=\"0 0 {{width}} {{height}}\">\n  <rect width=\"100%\" height=\"100%\" fill=\"#ffffff\"/>\n  <rect x=\"64\" y=\"64\" width=\"1072\" height=\"502\" fill=\"none\" stroke=\"#cbd5e1\" stroke-width=\"2\"/>\n  <text x=\"104\" y=\"170\" fill=\"#475569\" font-family=\"{{fontFamily}}\" font-size=\"28\">{{category}}</text>\n  <text x=\"104\" y=\"300\" fill=\"#0f172a\" font-family=\"{{fontFamily}}\" font-size=\"60\" font-weight=\"700\">{{title}}</text>\n  <text x=\"104\" y=\"390\" fill=\"#475569\" font-family=\"{{fontFamily}}\" font-size=\"30\">{{subtitle}}</text>\n  <text x=\"104\" y=\"510\" fill=\"#0f172a\" font-family=\"{{fontFamily}}\" font-size=\"26\">{{siteName}}</text>\n</svg>";
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
    readonly template?: string;
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
export declare function renderOgSvg(data: OgTemplateData, options?: RenderOgSvgOptions): string;
export declare function generateOgImage(data: OgTemplateData, options: GenerateOgImageOptions): Promise<GeneratedOgImage>;
export declare function planOgImage(data: OgTemplateData, options?: PlanOgImageOptions): Promise<PlannedOgImage>;
//# sourceMappingURL=og.d.ts.map