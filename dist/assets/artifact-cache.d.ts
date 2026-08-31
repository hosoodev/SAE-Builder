export interface CachedArtifact {
    readonly contents: Uint8Array;
    readonly contentHash: string;
    readonly width: number;
    readonly height: number;
    readonly cacheHit: boolean;
}
export interface ArtifactCreation {
    readonly contents: Uint8Array;
    readonly width: number;
    readonly height: number;
}
export declare function materializeIfChanged(target: string, contents: Uint8Array): Promise<boolean>;
export declare function getOrCreateArtifact(cacheDirectory: string, recipeHash: string, extension: string, create: () => Promise<ArtifactCreation>): Promise<CachedArtifact>;
//# sourceMappingURL=artifact-cache.d.ts.map