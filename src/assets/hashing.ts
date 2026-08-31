import { createHash } from "node:crypto";

export function hashContent(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export function shortHash(content: string | Uint8Array, length = 10): string {
  return hashContent(content).slice(0, length);
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
