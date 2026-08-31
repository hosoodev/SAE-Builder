export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

export interface Logger {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
}

const rank: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export function createLogger(
  level: LogLevel = "info",
  sink: Pick<Console, "error" | "warn" | "log"> = console,
): Logger {
  const enabled = (candidate: Exclude<LogLevel, "silent">): boolean =>
    rank[level] >= rank[candidate];

  return {
    error: (message) => {
      if (enabled("error")) sink.error(message);
    },
    warn: (message) => {
      if (enabled("warn")) sink.warn(message);
    },
    info: (message) => {
      if (enabled("info")) sink.log(message);
    },
    debug: (message) => {
      if (enabled("debug")) sink.log(message);
    },
  };
}
