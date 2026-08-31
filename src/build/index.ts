export { CACHE_VERSION, loadBuildCache, saveBuildCache } from "./cache.js";
export type { BuildCache } from "./cache.js";
export { applySiteBasePath } from "./base-path.js";
export { DependencyGraph } from "./graph.js";
export type { SerializedDependencyGraph } from "./graph.js";
export { planInvalidation, syncOutputTree } from "./incremental.js";
export type { InvalidationPlan, OutputSyncResult } from "./incremental.js";
export { minifyHtmlDocument } from "./html.js";
export { BUILDER_VERSION, build, check, clean, validateProjectPaths } from "./builder.js";
export type {
  BuildOptions,
  BuildResult,
  BuiltPage,
  IncrementalBuildStats,
} from "./builder.js";
