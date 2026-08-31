import path from "node:path";

import { BuilderError } from "../core/errors.js";

export function isPathInsideRoot(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function assertPathInsideRoot(root: string, target: string, label = "path"): string {
  const resolved = path.resolve(target);
  if (!isPathInsideRoot(root, resolved)) {
    throw new BuilderError("PATH_OUTSIDE_ROOT", `${label} must stay inside the project root.`, {
      details: { root: path.resolve(root), path: resolved },
    });
  }
  return resolved;
}

export function resolveInsideRoot(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root);
  return assertPathInsideRoot(resolvedRoot, path.resolve(resolvedRoot, ...segments));
}

export function relativeInsideRoot(root: string, target: string): string {
  const safe = assertPathInsideRoot(root, target);
  return path.relative(path.resolve(root), safe);
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function assertSafeRelativePath(value: string, label = "path"): string {
  if (
    !value
    || value.includes("\0")
    || path.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || path.posix.isAbsolute(value)
    || /^[A-Za-z]:/.test(value)
  ) {
    throw new BuilderError("PATH_INVALID", `${label} must be a non-empty relative path.`, { details: { path: value } });
  }
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments.some(segment => segment === "" || segment === "." || segment === "..")) {
    throw new BuilderError("PATH_INVALID", `${label} cannot contain a traversal segment.`, { details: { path: value } });
  }
  return segments.join("/");
}

// Compatibility names kept at the public boundary; all implementations are
// aliases of the single ancestor-safe path module.
export const isInsideRoot = isPathInsideRoot;
export const assertInsideRoot = assertPathInsideRoot;
