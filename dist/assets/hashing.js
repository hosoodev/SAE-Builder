import { createHash } from "node:crypto";
export function hashContent(content) {
    return createHash("sha256").update(content).digest("hex");
}
export function shortHash(content, length = 10) {
    return hashContent(content).slice(0, length);
}
export function stableStringify(value) {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    const record = value;
    return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
        .join(",")}}`;
}
//# sourceMappingURL=hashing.js.map