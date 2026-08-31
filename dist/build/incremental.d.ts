import { type SerializedDependencyGraph } from "./graph.js";
export interface InvalidationPlan {
    readonly changedNodes: ReadonlySet<string>;
    readonly affectedNodes: ReadonlySet<string>;
    readonly affectedOutputs: ReadonlySet<string>;
}
export interface OutputSyncResult {
    readonly written: readonly string[];
    readonly unchanged: readonly string[];
    readonly removed: readonly string[];
}
export declare function planInvalidation(previous: SerializedDependencyGraph | null, currentFingerprints: Readonly<Record<string, string>>): InvalidationPlan;
/**
 * Publish a validated stage tree without touching byte-identical output files.
 * This is what preserves mtimes for unaffected pages during warm builds.
 */
export declare function syncOutputTree(stageRoot: string, outputRoot: string, options?: {
    readonly removeStale?: boolean;
}): Promise<OutputSyncResult>;
//# sourceMappingURL=incremental.d.ts.map