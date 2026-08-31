import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { BuilderError } from "../core/index.js";
import { assertInsideRoot, assertNoSymlinkPath, resolveFileInsideRoot, } from "../filesystem/index.js";
import { orderPlugins } from "./order.js";
function projectRelativeTarget(root, relativePath, label) {
    if (!relativePath || path.isAbsolute(relativePath)) {
        throw new BuilderError("PATH_INVALID", `${label} must be a non-empty project-relative path.`);
    }
    return assertInsideRoot(root, path.resolve(root, relativePath));
}
function assertContentIdentity(before, after) {
    if (after.sourcePath !== before.sourcePath ||
        after.sourceRelativePath !== before.sourceRelativePath ||
        after.route.slug !== before.route.slug ||
        after.route.outputPath !== before.route.outputPath ||
        after.route.isExplicitFile !== before.route.isExplicitFile) {
        throw new TypeError("Content plugins must preserve sourcePath, sourceRelativePath, and route identity.");
    }
}
function assertPageIdentity(before, after) {
    if (after.source !== before.source ||
        after.route !== before.route ||
        after.outputPath !== before.outputPath) {
        throw new TypeError("renderPage plugins must preserve source, route, and outputPath.");
    }
}
export class PluginRunner {
    plugins;
    diagnostics;
    #config;
    #options;
    constructor(plugins, options) {
        this.plugins = orderPlugins(plugins);
        this.#config = options.config;
        this.#options = options;
        this.diagnostics = options.diagnostics ?? [];
    }
    get config() {
        return this.#config;
    }
    #context(plugin) {
        const config = this.#config;
        return Object.freeze({
            config,
            root: config.root,
            outputRoot: this.#options.outputRoot,
            cacheRoot: config.resolvedPaths.cache,
            mode: this.#options.mode,
            logger: this.#options.logger,
            addDependency: (node, dependency) => {
                this.#options.addDependency?.(node, dependency);
            },
            addDiagnostic: (diagnostic) => {
                this.diagnostics.push({ ...diagnostic, plugin: plugin.name });
            },
            readProjectFile: async (relativePath) => readFile(await resolveFileInsideRoot(config.root, relativePath, "Plugin read path")),
            emitFile: async (relativePath, contents) => {
                const target = projectRelativeTarget(this.#options.outputRoot, relativePath, "Plugin output path");
                const normalized = path.relative(this.#options.outputRoot, target).split(path.sep).join("/");
                if (this.#options.emitFile) {
                    await this.#options.emitFile(plugin.name, normalized, contents);
                    return;
                }
                await mkdir(this.#options.outputRoot, { recursive: true });
                await assertNoSymlinkPath(this.#options.outputRoot, path.dirname(target), true);
                await mkdir(path.dirname(target), { recursive: true });
                await writeFile(target, contents);
            },
        });
    }
    async #call(plugin, hook, callback) {
        try {
            return await callback();
        }
        catch (error) {
            throw new BuilderError("PLUGIN_FAILED", `Plugin '${plugin.name}' failed in ${String(hook)}.`, { cause: error, details: { plugin: plugin.name, hook } });
        }
    }
    async applyConfig() {
        for (const plugin of this.plugins) {
            if (!plugin.config)
                continue;
            const replacement = await this.#call(plugin, "config", async () => plugin.config?.(this.#config));
            if (replacement)
                this.#config = replacement;
        }
        return this.#config;
    }
    async buildStart() {
        for (const plugin of this.plugins) {
            if (plugin.buildStart)
                await this.#call(plugin, "buildStart", async () => plugin.buildStart?.(this.#context(plugin)));
        }
    }
    async contentLoaded(entry) {
        let current = entry;
        for (const plugin of this.plugins) {
            if (!plugin.contentLoaded)
                continue;
            const replacement = await this.#call(plugin, "contentLoaded", async () => {
                const candidate = await plugin.contentLoaded?.(current, this.#context(plugin));
                if (candidate)
                    assertContentIdentity(current, candidate);
                return candidate;
            });
            if (replacement)
                current = replacement;
        }
        return current;
    }
    async transformContent(entry) {
        let current = entry;
        for (const plugin of this.plugins) {
            if (!plugin.transformContent)
                continue;
            const replacement = await this.#call(plugin, "transformContent", async () => {
                const candidate = await plugin.transformContent?.(current, this.#context(plugin));
                if (candidate)
                    assertContentIdentity(current, candidate);
                return candidate;
            });
            if (replacement)
                current = replacement;
        }
        return current;
    }
    async renderPage(page) {
        let current = page;
        for (const plugin of this.plugins) {
            if (!plugin.renderPage)
                continue;
            const replacement = await this.#call(plugin, "renderPage", async () => {
                const candidate = await plugin.renderPage?.(current, this.#context(plugin));
                if (candidate)
                    assertPageIdentity(current, candidate);
                return candidate;
            });
            if (replacement)
                current = replacement;
        }
        return current;
    }
    async generateBundle(bundle) {
        for (const plugin of this.plugins) {
            if (!plugin.generateBundle)
                continue;
            const context = this.#context(plugin);
            const scopedBundle = Object.freeze({
                ...bundle,
                emitFile: context.emitFile,
            });
            await this.#call(plugin, "generateBundle", async () => plugin.generateBundle?.(scopedBundle, context));
        }
    }
    async buildEnd(result) {
        for (const plugin of this.plugins) {
            if (plugin.buildEnd)
                await this.#call(plugin, "buildEnd", async () => plugin.buildEnd?.(result, this.#context(plugin)));
        }
    }
}
export function createPluginRunner(plugins, options) {
    return new PluginRunner(plugins, options);
}
//# sourceMappingURL=runtime.js.map