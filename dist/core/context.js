import { createLogger } from "./logger.js";
export function createBuildContext(config, options = {}) {
    return {
        config,
        logger: options.logger ?? createLogger(),
        mode: options.mode ?? "production",
    };
}
//# sourceMappingURL=context.js.map