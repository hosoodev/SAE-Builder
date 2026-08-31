import path from "node:path";
import { assertNoSymlinkPath, assertPathInsideRoot, assertSafeRelativePath, readTextInside, resolveInsideRoot, } from "../filesystem/index.js";
import { renderTemplate, TemplateError, } from "./engine.js";
function normalizedName(name, extension) {
    const withoutExtension = name.endsWith(extension) ? name.slice(0, -extension.length) : name;
    const safeName = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
    if (!safeName.test(withoutExtension) || name.includes("\\")) {
        throw new TemplateError("INVALID_TEMPLATE", `Invalid template name ${JSON.stringify(name)}`);
    }
    return withoutExtension;
}
export class FileTemplateLoader {
    root;
    layoutsRoot;
    partialsRoot;
    extension;
    cacheEnabled;
    #cache = new Map();
    constructor(options) {
        this.root = path.resolve(options.root);
        const layoutsDirectory = assertSafeRelativePath(options.layoutsDirectory ?? "layouts", "layouts directory");
        const partialsDirectory = assertSafeRelativePath(options.partialsDirectory ?? "partials", "partials directory");
        this.layoutsRoot = resolveInsideRoot(this.root, ...layoutsDirectory.split("/"));
        this.partialsRoot = resolveInsideRoot(this.root, ...partialsDirectory.split("/"));
        this.extension = options.extension ?? ".html";
        if (!/^\.[A-Za-z0-9]+$/.test(this.extension)) {
            throw new TemplateError("INVALID_TEMPLATE", `Invalid template extension ${JSON.stringify(this.extension)}`);
        }
        this.cacheEnabled = options.cache ?? true;
    }
    clearCache() {
        this.#cache.clear();
    }
    invalidate(templatePath) {
        if (templatePath === undefined) {
            this.clearCache();
            return;
        }
        const candidate = path.isAbsolute(templatePath)
            ? templatePath
            : path.resolve(this.root, templatePath);
        this.#cache.delete(assertPathInsideRoot(this.root, candidate));
    }
    async loadLayout(name) {
        return this.#load("layout", name);
    }
    async loadPartial(name) {
        return this.#load("partial", name);
    }
    async renderLayout(name, data, options = {}) {
        const layout = await this.loadLayout(name);
        return renderTemplate(layout.content, data, {
            ...options,
            templateName: layout.name,
            rootDependencyId: layout.id,
            resolvePartial: async (partialName) => {
                const partial = await this.loadPartial(partialName);
                return {
                    name: partial.name,
                    content: partial.content,
                    dependencyId: partial.id,
                };
            },
        });
    }
    async #load(kind, inputName) {
        const name = normalizedName(inputName, this.extension);
        const directory = kind === "layout" ? this.layoutsRoot : this.partialsRoot;
        const relativePath = `${name}${this.extension}`;
        const filePath = resolveInsideRoot(directory, ...relativePath.split("/"));
        try {
            await assertNoSymlinkPath(this.root, filePath);
        }
        catch (error) {
            if (error.code === "ENOENT") {
                throw new TemplateError(kind === "layout" ? "MISSING_LAYOUT" : "MISSING_PARTIAL", `Missing ${kind} ${JSON.stringify(name)} at ${filePath}`);
            }
            throw error;
        }
        let content = this.#cache.get(filePath);
        if (content === undefined) {
            try {
                content = await readTextInside(directory, relativePath);
            }
            catch (error) {
                const code = error.code;
                if (code === "ENOENT") {
                    throw new TemplateError(kind === "layout" ? "MISSING_LAYOUT" : "MISSING_PARTIAL", `Missing ${kind} ${JSON.stringify(name)} at ${filePath}`);
                }
                throw error;
            }
            if (this.cacheEnabled)
                this.#cache.set(filePath, content);
        }
        return {
            kind,
            name,
            id: kind === "layout" ? `template:${name}` : `partial:${name}`,
            path: filePath,
            content,
        };
    }
}
//# sourceMappingURL=loader.js.map