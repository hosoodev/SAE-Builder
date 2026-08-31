export interface SerializedDependencyGraph {
    fingerprints: Record<string, string>;
    dependencies: Record<string, string[]>;
}
export declare class DependencyGraph {
    #private;
    setFingerprint(node: string, fingerprint: string): void;
    addDependency(node: string, dependency: string): void;
    fingerprint(node: string): string | undefined;
    nodes(): readonly string[];
    affectedBy(changedNodes: Iterable<string>): Set<string>;
    serialize(): SerializedDependencyGraph;
    static from(serialized: SerializedDependencyGraph): DependencyGraph;
}
//# sourceMappingURL=graph.d.ts.map