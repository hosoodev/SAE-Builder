import path from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

import { hashContent } from "./hashing.js";

interface ArtifactMetadata {
  readonly version: 1;
  readonly recipeHash: string;
  readonly contentHash: string;
  readonly extension: string;
  readonly width: number;
  readonly height: number;
}

export interface CachedArtifact {
  readonly contents: Uint8Array;
  readonly contentHash: string;
  readonly width: number;
  readonly height: number;
  readonly cacheHit: boolean;
}

export interface ArtifactCreation {
  readonly contents: Uint8Array;
  readonly width: number;
  readonly height: number;
}

let temporarySequence = 0;

async function readCachedArtifact(
  cacheDirectory: string,
  recipeHash: string,
  extension: string,
): Promise<CachedArtifact | null> {
  try {
    const metadataFile = path.join(cacheDirectory, "recipes", `${recipeHash}.json`);
    const metadata = JSON.parse(await readFile(metadataFile, "utf8")) as Partial<ArtifactMetadata>;
    if (
      metadata.version !== 1
      || metadata.recipeHash !== recipeHash
      || metadata.extension !== extension
      || typeof metadata.contentHash !== "string"
      || !Number.isInteger(metadata.width)
      || !Number.isInteger(metadata.height)
    ) return null;

    const contents = await readFile(path.join(cacheDirectory, "objects", `${metadata.contentHash}.${extension}`));
    if (hashContent(contents) !== metadata.contentHash) return null;
    return {
      contents,
      contentHash: metadata.contentHash,
      width: metadata.width,
      height: metadata.height,
      cacheHit: true,
    } as CachedArtifact;
  } catch {
    return null;
  }
}

async function atomicWriteIfMissing(target: string, contents: string | Uint8Array): Promise<void> {
  try {
    await readFile(target);
    return;
  } catch {
    // The content-addressed target does not exist yet.
  }
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${temporarySequence++}`;
  try {
    await writeFile(temporary, contents);
    try {
      await rename(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function materializeIfChanged(target: string, contents: Uint8Array): Promise<boolean> {
  try {
    const current = await readFile(target);
    if (current.length === contents.byteLength && current.equals(Buffer.from(contents))) return false;
  } catch {
    // Missing output is written below.
  }
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${temporarySequence++}`;
  try {
    await writeFile(temporary, contents);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
  return true;
}

export async function getOrCreateArtifact(
  cacheDirectory: string,
  recipeHash: string,
  extension: string,
  create: () => Promise<ArtifactCreation>,
): Promise<CachedArtifact> {
  const cached = await readCachedArtifact(cacheDirectory, recipeHash, extension);
  if (cached) return cached;

  const created = await create();
  const contentHash = hashContent(created.contents);
  const objectFile = path.join(cacheDirectory, "objects", `${contentHash}.${extension}`);
  await atomicWriteIfMissing(objectFile, created.contents);
  const metadata: ArtifactMetadata = {
    version: 1,
    recipeHash,
    contentHash,
    extension,
    width: created.width,
    height: created.height,
  };
  await atomicWriteIfMissing(
    path.join(cacheDirectory, "recipes", `${recipeHash}.json`),
    `${JSON.stringify(metadata)}\n`,
  );
  return { ...created, contentHash, cacheHit: false };
}
