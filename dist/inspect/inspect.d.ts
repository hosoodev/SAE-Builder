import { type BuildOptions, type BuildResult, type BuiltPage } from "../build/index.js";
export interface InspectHreflangAlternative {
    readonly hreflang: string;
    readonly href: string;
}
export interface InspectReport {
    readonly source: string;
    readonly route: string;
    readonly layout: string | null;
    readonly partials: readonly string[];
    readonly canonical: string;
    readonly locale: string | null;
    readonly hreflangAlternatives: readonly InspectHreflangAlternative[];
    readonly jsonLd: readonly unknown[];
    readonly dependencies: readonly string[];
    readonly assets: {
        readonly css: readonly string[];
        readonly js: readonly string[];
    };
}
export type InspectOptions = Omit<BuildOptions, "write">;
export type NormalizedInspectTarget = {
    readonly kind: "route";
    readonly route: string;
} | {
    readonly kind: "url";
    readonly url: string;
    readonly pathname: string;
};
export declare function normalizeInspectTarget(input: string): NormalizedInspectTarget;
export declare function inspectBuiltPage(page: BuiltPage): InspectReport;
export declare function inspectBuildResult(result: BuildResult, requestedTarget: string): InspectReport;
export declare function inspect(requestedTarget: string, options?: InspectOptions): Promise<InspectReport>;
//# sourceMappingURL=inspect.d.ts.map