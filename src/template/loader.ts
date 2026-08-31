import path from "node:path";

import {
  assertNoSymlinkPath,
  assertPathInsideRoot,
  assertSafeRelativePath,
  readTextInside,
  resolveInsideRoot,
} from "../filesystem/index.js";
import {
  renderTemplate,
  TemplateError,
  type RenderTemplateOptions,
  type TemplateData,
  type TemplateRenderResult,
} from "./engine.js";

export type TemplateKind = "layout" | "partial";

export interface LoadedTemplate {
  kind: TemplateKind;
  name: string;
  id: string;
  path: string;
  content: string;
}

export interface TemplateLoaderOptions {
  root: string;
  layoutsDirectory?: string;
  partialsDirectory?: string;
  extension?: string;
  cache?: boolean;
}

export type LayoutRenderOptions = Omit<
  RenderTemplateOptions,
  "partials" | "resolvePartial" | "rootDependencyId" | "templateName"
>;

function normalizedName(name: string, extension: string): string {
  const withoutExtension = name.endsWith(extension) ? name.slice(0, -extension.length) : name;
  const safeName = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
  if (!safeName.test(withoutExtension) || name.includes("\\")) {
    throw new TemplateError("INVALID_TEMPLATE", `Invalid template name ${JSON.stringify(name)}`);
  }
  return withoutExtension;
}

export class FileTemplateLoader {
  readonly root: string;
  readonly layoutsRoot: string;
  readonly partialsRoot: string;
  readonly extension: string;
  readonly cacheEnabled: boolean;
  readonly #cache = new Map<string, string>();

  constructor(options: TemplateLoaderOptions) {
    this.root = path.resolve(options.root);
    const layoutsDirectory = assertSafeRelativePath(
      options.layoutsDirectory ?? "layouts",
      "layouts directory",
    );
    const partialsDirectory = assertSafeRelativePath(
      options.partialsDirectory ?? "partials",
      "partials directory",
    );
    this.layoutsRoot = resolveInsideRoot(this.root, ...layoutsDirectory.split("/"));
    this.partialsRoot = resolveInsideRoot(this.root, ...partialsDirectory.split("/"));
    this.extension = options.extension ?? ".html";
    if (!/^\.[A-Za-z0-9]+$/.test(this.extension)) {
      throw new TemplateError("INVALID_TEMPLATE", `Invalid template extension ${JSON.stringify(this.extension)}`);
    }
    this.cacheEnabled = options.cache ?? true;
  }

  clearCache(): void {
    this.#cache.clear();
  }

  invalidate(templatePath?: string): void {
    if (templatePath === undefined) {
      this.clearCache();
      return;
    }
    const candidate = path.isAbsolute(templatePath)
      ? templatePath
      : path.resolve(this.root, templatePath);
    this.#cache.delete(assertPathInsideRoot(this.root, candidate));
  }

  async loadLayout(name: string): Promise<LoadedTemplate> {
    return this.#load("layout", name);
  }

  async loadPartial(name: string): Promise<LoadedTemplate> {
    return this.#load("partial", name);
  }

  async renderLayout(
    name: string,
    data: TemplateData,
    options: LayoutRenderOptions = {},
  ): Promise<TemplateRenderResult> {
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

  async #load(kind: TemplateKind, inputName: string): Promise<LoadedTemplate> {
    const name = normalizedName(inputName, this.extension);
    const directory = kind === "layout" ? this.layoutsRoot : this.partialsRoot;
    const relativePath = `${name}${this.extension}`;
    const filePath = resolveInsideRoot(directory, ...relativePath.split("/"));
    try {
      await assertNoSymlinkPath(this.root, filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new TemplateError(
          kind === "layout" ? "MISSING_LAYOUT" : "MISSING_PARTIAL",
          `Missing ${kind} ${JSON.stringify(name)} at ${filePath}`,
        );
      }
      throw error;
    }

    let content = this.#cache.get(filePath);
    if (content === undefined) {
      try {
        content = await readTextInside(directory, relativePath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          throw new TemplateError(
            kind === "layout" ? "MISSING_LAYOUT" : "MISSING_PARTIAL",
            `Missing ${kind} ${JSON.stringify(name)} at ${filePath}`,
          );
        }
        throw error;
      }
      if (this.cacheEnabled) this.#cache.set(filePath, content);
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
