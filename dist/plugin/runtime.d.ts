import type { BuildResult, BuiltPage } from "../build/index.js";
import type { NormalizedContentEntry } from "../content/index.js";
import { type Logger, type ResolvedBuilderConfig } from "../core/index.js";
import type { BuildBundle, BuilderPlugin, PluginDiagnostic } from "./types.js";
export interface CreatePluginRunnerOptions {
    readonly config: ResolvedBuilderConfig;
    readonly outputRoot: string;
    readonly mode: "development" | "production";
    readonly logger: Logger;
    readonly addDependency?: (node: string, dependency: string) => void;
    readonly diagnostics?: PluginDiagnostic[];
    readonly emitFile?: (pluginName: string, relativePath: string, contents: string | Uint8Array) => Promise<void>;
}
export declare class PluginRunner {
    #private;
    readonly plugins: readonly BuilderPlugin[];
    readonly diagnostics: PluginDiagnostic[];
    constructor(plugins: readonly BuilderPlugin[], options: CreatePluginRunnerOptions);
    get config(): ResolvedBuilderConfig;
    applyConfig(): Promise<ResolvedBuilderConfig>;
    buildStart(): Promise<void>;
    contentLoaded(entry: NormalizedContentEntry): Promise<NormalizedContentEntry>;
    transformContent(entry: NormalizedContentEntry): Promise<NormalizedContentEntry>;
    renderPage(page: BuiltPage): Promise<BuiltPage>;
    generateBundle(bundle: BuildBundle): Promise<void>;
    buildEnd(result: BuildResult): Promise<void>;
}
export declare function createPluginRunner(plugins: readonly BuilderPlugin[], options: CreatePluginRunnerOptions): PluginRunner;
//# sourceMappingURL=runtime.d.ts.map