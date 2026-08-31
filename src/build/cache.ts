import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { SerializedDependencyGraph } from "./graph.js";

export const CACHE_VERSION = 3;
let cacheWriteSequence = 0;

export interface BuildCache {
  version: typeof CACHE_VERSION;
  builderVersion: string;
  graph: SerializedDependencyGraph;
  outputs: Record<string, string[]>;
  /** Hashes of published page bytes, keyed by project-output-relative path. */
  outputFingerprints: Record<string, string>;
}

export async function loadBuildCache(cacheRoot: string): Promise<BuildCache | null> {
  try {
    const raw = JSON.parse(
      await readFile(path.join(cacheRoot, "manifest.json"), "utf8"),
    ) as Partial<BuildCache>;
    if (
      raw.version !== CACHE_VERSION ||
      typeof raw.builderVersion !== "string" ||
      !raw.graph ||
      !raw.outputs ||
      !raw.outputFingerprints
    ) {
      return null;
    }
    return raw as BuildCache;
  } catch {
    return null;
  }
}

export async function saveBuildCache(cacheRoot: string, cache: BuildCache): Promise<void> {
  await mkdir(cacheRoot, { recursive: true });
  const target = path.join(cacheRoot, "manifest.json");
  cacheWriteSequence += 1;
  const temporary = path.join(
    cacheRoot,
    `.manifest-${process.pid}-${cacheWriteSequence}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}
