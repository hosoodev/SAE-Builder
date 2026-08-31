export interface AssetBuildOptions {
    projectRoot: string;
    outputRoot: string;
    entries: Record<string, string>;
    hash: boolean;
    minify: boolean;
}
export type AssetManifest = Record<string, string>;
export interface PlannedAssetFile {
    readonly name: string;
    readonly relativePath: string;
    readonly contents: Uint8Array;
}
export interface AssetBuildPlan {
    readonly manifest: AssetManifest;
    readonly files: readonly PlannedAssetFile[];
}
//# sourceMappingURL=types.d.ts.map