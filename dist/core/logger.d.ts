export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";
export interface Logger {
    error(message: string): void;
    warn(message: string): void;
    info(message: string): void;
    debug(message: string): void;
}
export declare function createLogger(level?: LogLevel, sink?: Pick<Console, "error" | "warn" | "log">): Logger;
//# sourceMappingURL=logger.d.ts.map