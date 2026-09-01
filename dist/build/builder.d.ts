import { type AssetManifest } from "../assets/index.js";
import { type Logger, type ResolvedBuilderConfig } from "../core/index.js";
import { type ContentRepository } from "../content/index.js";
import { type SeoDiagnostic } from "../seo/index.js";
export declare const BUILDER_VERSION = "0.3.4";
export interface BuildOptions {
    root?: string;
    configFile?: string;
    mode?: "development" | "production";
    write?: boolean;
    logger?: Logger;
}
export interface BuiltPage {
    readonly source: string;
    readonly route: string;
    readonly canonical: string;
    readonly html: string;
    readonly outputPath: string;
    readonly dependencies: readonly string[];
}
export interface BuildResult {
    root: string;
    outputRoot: string;
    pages: readonly BuiltPage[];
    content: ContentRepository;
    assets: AssetManifest;
    diagnostics: readonly SeoDiagnostic[];
    incremental: IncrementalBuildStats;
    written: boolean;
}
export interface IncrementalBuildStats {
    readonly renderedPages: number;
    readonly reusedPages: number;
    readonly invalidatedOutputs: readonly string[];
    readonly writtenFiles: readonly string[];
    readonly unchangedFiles: readonly string[];
    readonly removedFiles: readonly string[];
}
export declare function validateProjectPaths(config: ResolvedBuilderConfig): void;
export declare function build(options?: BuildOptions): Promise<BuildResult>;
export declare function check(options?: Omit<BuildOptions, "write">): Promise<BuildResult>;
export declare function clean(options?: Pick<BuildOptions, "root" | "configFile">): Promise<{
    root: string;
    removed: readonly string[];
}>;
//# sourceMappingURL=builder.d.ts.map