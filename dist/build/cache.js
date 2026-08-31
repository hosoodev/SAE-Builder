import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
export const CACHE_VERSION = 3;
let cacheWriteSequence = 0;
export async function loadBuildCache(cacheRoot) {
    try {
        const raw = JSON.parse(await readFile(path.join(cacheRoot, "manifest.json"), "utf8"));
        if (raw.version !== CACHE_VERSION ||
            typeof raw.builderVersion !== "string" ||
            !raw.graph ||
            !raw.outputs ||
            !raw.outputFingerprints) {
            return null;
        }
        return raw;
    }
    catch {
        return null;
    }
}
export async function saveBuildCache(cacheRoot, cache) {
    await mkdir(cacheRoot, { recursive: true });
    const target = path.join(cacheRoot, "manifest.json");
    cacheWriteSequence += 1;
    const temporary = path.join(cacheRoot, `.manifest-${process.pid}-${cacheWriteSequence}.tmp`);
    await writeFile(temporary, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    await rename(temporary, target);
}
//# sourceMappingURL=cache.js.map