import type { SerializedDependencyGraph } from "./graph.js";
export declare const CACHE_VERSION = 3;
export interface BuildCache {
    version: typeof CACHE_VERSION;
    builderVersion: string;
    graph: SerializedDependencyGraph;
    outputs: Record<string, string[]>;
    /** Hashes of published page bytes, keyed by project-output-relative path. */
    outputFingerprints: Record<string, string>;
}
export declare function loadBuildCache(cacheRoot: string): Promise<BuildCache | null>;
export declare function saveBuildCache(cacheRoot: string, cache: BuildCache): Promise<void>;
//# sourceMappingURL=cache.d.ts.map