import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";
import { transform } from "lightningcss";
import { assertNoSymlinkPath, assertPathInsideRoot, resolveFileInsideRoot, } from "../filesystem/index.js";
import { shortHash } from "./hashing.js";
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function outputName(name, css, useHash) {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "-");
    return useHash
        ? `${safeName}.${shortHash(css)}.css`
        : `${safeName}.css`;
}
export async function planCssEntries(options) {
    const manifest = {};
    const files = [];
    for (const [name, source] of Object.entries(options.entries).sort(([a], [b]) => compareText(a, b))) {
        const input = await resolveFileInsideRoot(options.projectRoot, source, `CSS asset entry '${name}'`);
        const css = await readFile(input, "utf8");
        const processed = await postcss([
            tailwindcss({
                base: options.projectRoot,
                optimize: false,
            }),
        ]).process(css, { from: input });
        const bytes = transform({
            filename: path.basename(input),
            code: Buffer.from(processed.css),
            minify: options.minify,
        }).code;
        const filename = outputName(name, bytes, options.hash);
        manifest[name] = `/assets/${filename}`;
        files.push({ name, relativePath: `assets/${filename}`, contents: bytes });
    }
    return { manifest, files };
}
export async function buildCssEntries(options) {
    const plan = await planCssEntries(options);
    const outputRoot = assertPathInsideRoot(options.projectRoot, options.outputRoot, "asset output root");
    await assertNoSymlinkPath(options.projectRoot, outputRoot, true);
    const assetRoot = path.join(outputRoot, "assets");
    await mkdir(assetRoot, { recursive: true });
    for (const file of plan.files) {
        await writeFile(path.join(outputRoot, ...file.relativePath.split("/")), file.contents);
    }
    return plan.manifest;
}
//# sourceMappingURL=css.js.map