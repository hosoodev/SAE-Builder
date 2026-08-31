export type BuilderErrorCode = "CONFIG_NOT_FOUND" | "CONFIG_INVALID" | "FILESYSTEM_ERROR" | "PATH_INVALID" | "PATH_OUTSIDE_ROOT" | "SYMLINK_NOT_ALLOWED" | "PLUGIN_FAILED" | "BUILD_FAILED" | "CHECK_FAILED" | "INSPECT_NOT_FOUND";
export declare class BuilderError extends Error {
    readonly code: BuilderErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: BuilderErrorCode, message: string, options?: {
        cause?: unknown;
        details?: Record<string, unknown>;
    });
}
export declare function toBuilderError(error: unknown, fallbackMessage: string): BuilderError;
//# sourceMappingURL=errors.d.ts.map