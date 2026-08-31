import type { AssetManifest } from "../assets/index.js";
import type { BuildResult, BuiltPage } from "../build/index.js";
import type { NormalizedContentEntry } from "../content/index.js";
import type { Logger, ResolvedBuilderConfig } from "../core/index.js";

export type MaybePromise<T> = T | Promise<T>;
export type PluginEnforce = "pre" | "post";

export interface PluginDiagnostic {
  readonly plugin: string;
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly source?: string;
}

export interface PluginContext {
  readonly config: ResolvedBuilderConfig;
  readonly root: string;
  readonly outputRoot: string;
  readonly cacheRoot: string;
  readonly mode: "development" | "production";
  readonly logger: Logger;
  addDependency(node: string, dependency: string): void;
  addDiagnostic(diagnostic: Omit<PluginDiagnostic, "plugin">): void;
  readProjectFile(relativePath: string): Promise<Uint8Array>;
  emitFile(relativePath: string, contents: string | Uint8Array): Promise<void>;
}

export interface BuildBundle {
  readonly pages: readonly BuiltPage[];
  readonly assets: Readonly<AssetManifest>;
  readonly outputRoot: string;
  emitFile(relativePath: string, contents: string | Uint8Array): Promise<void>;
}

export interface BuilderPlugin {
  readonly name: string;
  readonly enforce?: PluginEnforce;
  config?(config: ResolvedBuilderConfig): MaybePromise<ResolvedBuilderConfig | void>;
  buildStart?(context: PluginContext): MaybePromise<void>;
  contentLoaded?(entry: NormalizedContentEntry, context: PluginContext):
    MaybePromise<NormalizedContentEntry | void>;
  transformContent?(entry: NormalizedContentEntry, context: PluginContext):
    MaybePromise<NormalizedContentEntry | void>;
  renderPage?(page: BuiltPage, context: PluginContext): MaybePromise<BuiltPage | void>;
  generateBundle?(bundle: BuildBundle, context: PluginContext): MaybePromise<void>;
  buildEnd?(result: BuildResult, context: PluginContext): MaybePromise<void>;
}
