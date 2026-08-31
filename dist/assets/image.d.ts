export type OptimizedImageFormat = "webp" | "avif";
export interface OptimizeImageOptions {
    readonly outputDirectory: string;
    readonly cacheDirectory: string;
    readonly publicPath?: string;
    readonly widths?: readonly number[];
    readonly formats?: readonly OptimizedImageFormat[];
    readonly quality?: number;
    readonly filenameStem?: string;
}
export interface OptimizedImageVariant {
    readonly format: OptimizedImageFormat;
    readonly width: number;
    readonly height: number;
    readonly contentHash: string;
    readonly filename: string;
    readonly filePath: string;
    readonly url: string;
    readonly cacheHit: boolean;
}
export interface OptimizedImageResult {
    readonly sourcePath: string;
    readonly sourceWidth: number;
    readonly sourceHeight: number;
    readonly variants: readonly OptimizedImageVariant[];
}
export interface PictureHtmlOptions {
    readonly alt: string;
    readonly loading?: "lazy" | "eager";
    readonly decoding?: "async" | "sync" | "auto";
    readonly fetchPriority?: "high" | "low" | "auto";
    readonly sizes?: string;
    readonly className?: string;
}
export type ImageHelperOptions = OptimizeImageOptions & PictureHtmlOptions;
export declare function optimizeImage(sourcePath: string, options: OptimizeImageOptions): Promise<OptimizedImageResult>;
export declare function renderPictureHtml(result: OptimizedImageResult, options: PictureHtmlOptions): string;
/** Optimize a project image and return the complete static `<picture>` markup. */
export declare function image(sourcePath: string, options: ImageHelperOptions): Promise<string>;
//# sourceMappingURL=image.d.ts.map