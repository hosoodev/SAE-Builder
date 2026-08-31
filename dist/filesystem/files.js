import path from "node:path";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile, } from "node:fs/promises";
import { BuilderError } from "../core/errors.js";
import { assertPathInsideRoot, assertSafeRelativePath, relativeInsideRoot, resolveInsideRoot, toPosixPath, } from "./paths.js";
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
export async function pathExists(target) {
    try {
        await stat(target);
        return true;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
async function assertRootIsDirectory(root) {
    const resolvedRoot = path.resolve(root);
    let metadata;
    try {
        metadata = await lstat(resolvedRoot);
    }
    catch (cause) {
        throw new BuilderError("FILESYSTEM_ERROR", `Filesystem root does not exist: ${resolvedRoot}`, { cause });
    }
    if (metadata.isSymbolicLink()) {
        throw new BuilderError("SYMLINK_NOT_ALLOWED", `Filesystem roots cannot be symbolic links: ${resolvedRoot}`);
    }
    if (!metadata.isDirectory()) {
        throw new BuilderError("FILESYSTEM_ERROR", `Filesystem root is not a directory: ${resolvedRoot}`);
    }
    return resolvedRoot;
}
export async function canonicalizeRoot(root) {
    const safeRoot = await assertRootIsDirectory(root);
    try {
        return await realpath(safeRoot);
    }
    catch (cause) {
        throw new BuilderError("FILESYSTEM_ERROR", `Unable to resolve filesystem root: ${safeRoot}`, { cause });
    }
}
/** Reject a symlink or junction at the root or at any existing descendant. */
export async function assertNoSymlinkPath(root, target, allowMissingLeaf = false) {
    const safeRoot = await assertRootIsDirectory(root);
    const safe = assertPathInsideRoot(safeRoot, target);
    const relative = path.relative(safeRoot, safe);
    let cursor = safeRoot;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, segment);
        try {
            const entry = await lstat(cursor);
            if (entry.isSymbolicLink()) {
                throw new BuilderError("SYMLINK_NOT_ALLOWED", `Symbolic links are not allowed at this boundary: ${cursor}`);
            }
        }
        catch (error) {
            if (allowMissingLeaf && error.code === "ENOENT")
                break;
            throw error;
        }
    }
    return safe;
}
/** Resolve a user/config supplied project-relative entry and verify ancestors. */
export async function resolveFileInsideRoot(root, entry, label = "file entry") {
    const relative = assertSafeRelativePath(entry, label);
    const target = resolveInsideRoot(root, ...relative.split("/"));
    await assertNoSymlinkPath(root, target);
    const metadata = await stat(target);
    if (!metadata.isFile()) {
        throw new BuilderError("FILESYSTEM_ERROR", `${label} is not a file: ${target}`);
    }
    return target;
}
export async function readTextFile(root, relativePath) {
    const target = await resolveFileInsideRoot(root, relativePath, "text file");
    return readFile(target, "utf8");
}
export const readTextInside = readTextFile;
export async function discoverFiles(root, directoryOrOptions = {}, maybeOptions = {}) {
    const options = typeof directoryOrOptions === "string" ? maybeOptions : directoryOrOptions;
    const requestedDirectory = typeof directoryOrOptions === "string"
        ? assertSafeRelativePath(directoryOrOptions, "discovery directory")
        : undefined;
    const resolvedRoot = path.resolve(root);
    if (!await pathExists(resolvedRoot)) {
        if (options.optional)
            return [];
        throw new BuilderError("FILESYSTEM_ERROR", `Directory does not exist: ${resolvedRoot}`);
    }
    await assertRootIsDirectory(resolvedRoot);
    const start = requestedDirectory === undefined
        ? resolvedRoot
        : resolveInsideRoot(resolvedRoot, ...requestedDirectory.split("/"));
    if (!await pathExists(start)) {
        if (options.optional)
            return [];
        throw new BuilderError("FILESYSTEM_ERROR", `Directory does not exist: ${start}`);
    }
    await assertNoSymlinkPath(resolvedRoot, start);
    if (!(await stat(start)).isDirectory()) {
        throw new BuilderError("FILESYSTEM_ERROR", `Discovery entry is not a directory: ${start}`);
    }
    const allowed = options.extensions?.map(extension => extension.toLowerCase());
    const discovered = [];
    const visit = async (current) => {
        const entries = await readdir(current, { withFileTypes: true });
        entries.sort((left, right) => compareText(left.name, right.name));
        for (const entry of entries) {
            const target = assertPathInsideRoot(resolvedRoot, path.join(current, entry.name));
            if (entry.isSymbolicLink()) {
                throw new BuilderError("SYMLINK_NOT_ALLOWED", `Symbolic links are not allowed during discovery: ${target}`);
            }
            if (entry.isDirectory())
                await visit(target);
            else if (entry.isFile()
                && (!allowed || allowed.includes(path.extname(entry.name).toLowerCase()))) {
                discovered.push(target);
            }
        }
    };
    await visit(start);
    return discovered.sort((left, right) => compareText(toPosixPath(left), toPosixPath(right)));
}
let temporarySequence = 0;
export async function writeFileAtomic(root, target, contents) {
    const safe = path.isAbsolute(target)
        ? assertPathInsideRoot(root, target)
        : resolveInsideRoot(root, ...assertSafeRelativePath(target, "output file").split("/"));
    if (path.resolve(root) === safe) {
        throw new BuilderError("PATH_INVALID", "Cannot replace the filesystem root with a file.");
    }
    await assertNoSymlinkPath(root, path.dirname(safe), true);
    await mkdir(path.dirname(safe), { recursive: true });
    const temporary = `${safe}.tmp-${process.pid}-${temporarySequence++}`;
    try {
        await writeFile(temporary, contents);
        await rename(temporary, safe);
    }
    finally {
        await rm(temporary, { force: true }).catch(() => undefined);
    }
}
export async function writeTextInside(root, relativePath, value) {
    await writeFileAtomic(root, relativePath, value);
}
export async function copyDirectory(sourceRoot, outputRoot) {
    if (!await pathExists(sourceRoot))
        return;
    const files = await discoverFiles(sourceRoot, { optional: true });
    for (const source of files) {
        const relative = relativeInsideRoot(sourceRoot, source);
        const target = resolveInsideRoot(outputRoot, ...relative.split("/"));
        await assertNoSymlinkPath(outputRoot, path.dirname(target), true);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(source, target);
    }
}
//# sourceMappingURL=files.js.map