import type { Logger } from "./logger.js";
import type { ResolvedBuilderConfig } from "./types.js";
export interface BuildContext {
    config: ResolvedBuilderConfig;
    logger: Logger;
    mode: "development" | "production";
}
export declare function createBuildContext(config: ResolvedBuilderConfig, options?: {
    logger?: Logger;
    mode?: BuildContext["mode"];
}): BuildContext;
//# sourceMappingURL=context.d.ts.map