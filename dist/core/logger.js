const rank = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
};
export function createLogger(level = "info", sink = console) {
    const enabled = (candidate) => rank[level] >= rank[candidate];
    return {
        error: (message) => {
            if (enabled("error"))
                sink.error(message);
        },
        warn: (message) => {
            if (enabled("warn"))
                sink.warn(message);
        },
        info: (message) => {
            if (enabled("info"))
                sink.log(message);
        },
        debug: (message) => {
            if (enabled("debug"))
                sink.log(message);
        },
    };
}
//# sourceMappingURL=logger.js.map