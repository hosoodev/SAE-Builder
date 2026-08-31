import path from "node:path";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";

import { hashContent } from "../assets/index.js";
import {
  assertInsideRoot,
  assertNoSymlinkPath,
} from "../filesystem/index.js";
import { DependencyGraph, type SerializedDependencyGraph } from "./graph.js";

export interface InvalidationPlan {
  readonly changedNodes: ReadonlySet<string>;
  readonly affectedNodes: ReadonlySet<string>;
  readonly affectedOutputs: ReadonlySet<string>;
}

export interface OutputSyncResult {
  readonly written: readonly string[];
  readonly unchanged: readonly string[];
  readonly removed: readonly string[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function planInvalidation(
  previous: SerializedDependencyGraph | null,
  currentFingerprints: Readonly<Record<string, string>>,
): InvalidationPlan {
  const changed = new Set<string>();
  if (previous === null) {
    for (const node of Object.keys(currentFingerprints)) changed.add(node);
  } else {
    for (const node of new Set([
      ...Object.keys(previous.fingerprints),
      ...Object.keys(currentFingerprints),
    ])) {
      if (previous.fingerprints[node] !== currentFingerprints[node]) changed.add(node);
    }
  }
  const graph = previous === null
    ? new DependencyGraph()
    : DependencyGraph.from(previous);
  const affected = graph.affectedBy(changed);
  return {
    changedNodes: changed,
    affectedNodes: affected,
    affectedOutputs: new Set([...affected].filter((node) => node.startsWith("output:"))),
  };
}

async function filesBelow(root: string): Promise<string[]> {
  const resolvedRoot = path.resolve(root);
  const output: string[] = [];
  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const target = assertInsideRoot(resolvedRoot, path.join(directory, entry.name));
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed in a build tree: ${target}`);
      }
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) output.push(target);
    }
  }
  await visit(resolvedRoot);
  return output;
}

async function sameFile(left: string, right: string): Promise<boolean> {
  try {
    const [leftStat, rightStat] = await Promise.all([stat(left), stat(right)]);
    if (leftStat.size !== rightStat.size) return false;
    const [leftBody, rightBody] = await Promise.all([readFile(left), readFile(right)]);
    return hashContent(leftBody) === hashContent(rightBody);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Publish a validated stage tree without touching byte-identical output files.
 * This is what preserves mtimes for unaffected pages during warm builds.
 */
export async function syncOutputTree(
  stageRoot: string,
  outputRoot: string,
  options: { readonly removeStale?: boolean } = {},
): Promise<OutputSyncResult> {
  const stage = path.resolve(stageRoot);
  const output = path.resolve(outputRoot);
  if (stage === output) throw new TypeError("Stage and output roots must differ.");
  await mkdir(output, { recursive: true });
  const stagedFiles = await filesBelow(stage);
  const expected = new Set<string>();
  const written: string[] = [];
  const unchanged: string[] = [];

  for (const source of stagedFiles) {
    const relative = path.relative(stage, source).split(path.sep).join("/");
    expected.add(relative);
    const target = assertInsideRoot(output, path.resolve(output, ...relative.split("/")));
    await assertNoSymlinkPath(output, target, true);
    if (await sameFile(source, target)) {
      unchanged.push(relative);
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    written.push(relative);
  }

  const removed: string[] = [];
  if (options.removeStale ?? true) {
    for (const target of await filesBelow(output)) {
      const relative = path.relative(output, target).split(path.sep).join("/");
      if (expected.has(relative)) continue;
      await assertNoSymlinkPath(output, target);
      await rm(assertInsideRoot(output, target), { force: true });
      removed.push(relative);
    }
  }

  return {
    written: written.sort(compareText),
    unchanged: unchanged.sort(compareText),
    removed: removed.sort(compareText),
  };
}
