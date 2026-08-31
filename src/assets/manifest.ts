import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { AssetManifest } from "./types.js";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function writeAssetManifest(
  outputRoot: string,
  manifest: AssetManifest,
): Promise<void> {
  const ordered = Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => compareText(a, b)),
  );
  const target = path.join(outputRoot, "assets", "manifest.json");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
}
