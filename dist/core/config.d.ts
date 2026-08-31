import type { ResolvedBuilderConfig, UserConfig } from "./types.js";
export declare function defineConfig(config: UserConfig): UserConfig;
export declare function resolveConfig(input: UserConfig, root: string, configFile?: string): ResolvedBuilderConfig;
export declare function loadConfig(root?: string, explicitConfigFile?: string): Promise<ResolvedBuilderConfig>;
//# sourceMappingURL=config.d.ts.map