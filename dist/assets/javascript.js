import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import * as esbuild from "esbuild";
import { assertNoSymlinkPath, assertPathInsideRoot, resolveFileInsideRoot, } from "../filesystem/index.js";
import { shortHash } from "./hashing.js";
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function outputName(name, code, useHash) {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "-");
    return useHash
        ? `${safeName}.${shortHash(code)}.js`
        : `${safeName}.js`;
}
export async function planScriptEntries(options) {
    const manifest = {};
    const files = [];
    for (const [name, source] of Object.entries(options.entries).sort(([a], [b]) => compareText(a, b))) {
        const input = await resolveFileInsideRoot(options.projectRoot, source, `JavaScript asset entry '${name}'`);
        const result = await esbuild.build({
            absWorkingDir: options.projectRoot,
            entryPoints: [input],
            bundle: true,
            format: "esm",
            minify: options.minify,
            platform: "browser",
            sourcemap: false,
            target: ["es2022"],
            treeShaking: true,
            metafile: true,
            write: false,
        });
        for (const bundledInput of Object.keys(result.metafile.inputs)) {
            const absoluteInput = path.isAbsolute(bundledInput)
                ? bundledInput
                : path.resolve(options.projectRoot, bundledInput);
            assertPathInsideRoot(options.projectRoot, absoluteInput, `JavaScript dependency of '${name}'`);
            await assertNoSymlinkPath(options.projectRoot, absoluteInput);
        }
        const output = result.outputFiles.at(0);
        if (!output) {
            throw new Error(`esbuild did not emit an output for script entry '${name}'.`);
        }
        const filename = outputName(name, output.contents, options.hash);
        manifest[name] = `/assets/${filename}`;
        files.push({ name, relativePath: `assets/${filename}`, contents: output.contents });
    }
    return { manifest, files };
}
export async function buildScriptEntries(options) {
    const plan = await planScriptEntries(options);
    const outputRoot = assertPathInsideRoot(options.projectRoot, options.outputRoot, "asset output root");
    await assertNoSymlinkPath(options.projectRoot, outputRoot, true);
    const assetRoot = path.join(outputRoot, "assets");
    await mkdir(assetRoot, { recursive: true });
    for (const file of plan.files) {
        await writeFile(path.join(outputRoot, ...file.relativePath.split("/")), file.contents);
    }
    return plan.manifest;
}
//# sourceMappingURL=javascript.js.map