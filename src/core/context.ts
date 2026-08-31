import type { Logger } from "./logger.js";
import { createLogger } from "./logger.js";
import type { ResolvedBuilderConfig } from "./types.js";

export interface BuildContext {
  config: ResolvedBuilderConfig;
  logger: Logger;
  mode: "development" | "production";
}

export function createBuildContext(
  config: ResolvedBuilderConfig,
  options: { logger?: Logger; mode?: BuildContext["mode"] } = {},
): BuildContext {
  return {
    config,
    logger: options.logger ?? createLogger(),
    mode: options.mode ?? "production",
  };
}
