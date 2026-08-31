export class BuilderError extends Error {
    code;
    details;
    constructor(code, message, options = {}) {
        super(message, { cause: options.cause });
        this.name = "BuilderError";
        this.code = code;
        this.details = options.details;
    }
}
export function toBuilderError(error, fallbackMessage) {
    if (error instanceof BuilderError)
        return error;
    return new BuilderError("BUILD_FAILED", fallbackMessage, { cause: error });
}
//# sourceMappingURL=errors.js.map