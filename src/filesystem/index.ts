export {
  assertNoSymlinkPath,
  canonicalizeRoot,
  copyDirectory,
  discoverFiles,
  pathExists,
  readTextFile,
  readTextInside,
  resolveFileInsideRoot,
  writeFileAtomic,
  writeTextInside,
} from "./files.js";
export {
  assertInsideRoot,
  assertPathInsideRoot,
  assertSafeRelativePath,
  isInsideRoot,
  isPathInsideRoot,
  relativeInsideRoot,
  resolveInsideRoot,
  toPosixPath,
} from "./paths.js";

export type { DiscoverFilesOptions } from "./files.js";
