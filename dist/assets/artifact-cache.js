import path from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { hashContent } from "./hashing.js";
let temporarySequence = 0;
async function readCachedArtifact(cacheDirectory, recipeHash, extension) {
    try {
        const metadataFile = path.join(cacheDirectory, "recipes", `${recipeHash}.json`);
        const metadata = JSON.parse(await readFile(metadataFile, "utf8"));
        if (metadata.version !== 1
            || metadata.recipeHash !== recipeHash
            || metadata.extension !== extension
            || typeof metadata.contentHash !== "string"
            || !Number.isInteger(metadata.width)
            || !Number.isInteger(metadata.height))
            return null;
        const contents = await readFile(path.join(cacheDirectory, "objects", `${metadata.contentHash}.${extension}`));
        if (hashContent(contents) !== metadata.contentHash)
            return null;
        return {
            contents,
            contentHash: metadata.contentHash,
            width: metadata.width,
            height: metadata.height,
            cacheHit: true,
        };
    }
    catch {
        return null;
    }
}
async function atomicWriteIfMissing(target, contents) {
    try {
        await readFile(target);
        return;
    }
    catch {
        // The content-addressed target does not exist yet.
    }
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}-${temporarySequence++}`;
    try {
        await writeFile(temporary, contents);
        try {
            await rename(temporary, target);
        }
        catch (error) {
            if (error.code !== "EEXIST")
                throw error;
        }
    }
    finally {
        await rm(temporary, { force: true }).catch(() => undefined);
    }
}
export async function materializeIfChanged(target, contents) {
    try {
        const current = await readFile(target);
        if (current.length === contents.byteLength && current.equals(Buffer.from(contents)))
            return false;
    }
    catch {
        // Missing output is written below.
    }
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}-${temporarySequence++}`;
    try {
        await writeFile(temporary, contents);
        await rename(temporary, target);
    }
    finally {
        await rm(temporary, { force: true }).catch(() => undefined);
    }
    return true;
}
export async function getOrCreateArtifact(cacheDirectory, recipeHash, extension, create) {
    const cached = await readCachedArtifact(cacheDirectory, recipeHash, extension);
    if (cached)
        return cached;
    const created = await create();
    const contentHash = hashContent(created.contents);
    const objectFile = path.join(cacheDirectory, "objects", `${contentHash}.${extension}`);
    await atomicWriteIfMissing(objectFile, created.contents);
    const metadata = {
        version: 1,
        recipeHash,
        contentHash,
        extension,
        width: created.width,
        height: created.height,
    };
    await atomicWriteIfMissing(path.join(cacheDirectory, "recipes", `${recipeHash}.json`), `${JSON.stringify(metadata)}\n`);
    return { ...created, contentHash, cacheHit: false };
}
//# sourceMappingURL=artifact-cache.js.map