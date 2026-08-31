export type BuilderErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_INVALID"
  | "FILESYSTEM_ERROR"
  | "PATH_INVALID"
  | "PATH_OUTSIDE_ROOT"
  | "SYMLINK_NOT_ALLOWED"
  | "PLUGIN_FAILED"
  | "BUILD_FAILED"
  | "CHECK_FAILED"
  | "INSPECT_NOT_FOUND";

export class BuilderError extends Error {
  readonly code: BuilderErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: BuilderErrorCode,
    message: string,
    options: { cause?: unknown; details?: Record<string, unknown> } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "BuilderError";
    this.code = code;
    this.details = options.details;
  }
}

export function toBuilderError(error: unknown, fallbackMessage: string): BuilderError {
  if (error instanceof BuilderError) return error;
  return new BuilderError("BUILD_FAILED", fallbackMessage, { cause: error });
}
