import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { BuildResult, BuiltPage } from "../build/index.js";
import type { NormalizedContentEntry } from "../content/index.js";
import { BuilderError, type Logger, type ResolvedBuilderConfig } from "../core/index.js";
import {
  assertInsideRoot,
  assertNoSymlinkPath,
  resolveFileInsideRoot,
} from "../filesystem/index.js";
import { orderPlugins } from "./order.js";
import type {
  BuildBundle,
  BuilderPlugin,
  PluginContext,
  PluginDiagnostic,
} from "./types.js";

export interface CreatePluginRunnerOptions {
  readonly config: ResolvedBuilderConfig;
  readonly outputRoot: string;
  readonly mode: "development" | "production";
  readonly logger: Logger;
  readonly addDependency?: (node: string, dependency: string) => void;
  readonly diagnostics?: PluginDiagnostic[];
  readonly emitFile?: (
    pluginName: string,
    relativePath: string,
    contents: string | Uint8Array,
  ) => Promise<void>;
}

function projectRelativeTarget(root: string, relativePath: string, label: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new BuilderError("PATH_INVALID", `${label} must be a non-empty project-relative path.`);
  }
  return assertInsideRoot(root, path.resolve(root, relativePath));
}

function assertContentIdentity(
  before: NormalizedContentEntry,
  after: NormalizedContentEntry,
): void {
  if (
    after.sourcePath !== before.sourcePath ||
    after.sourceRelativePath !== before.sourceRelativePath ||
    after.route.slug !== before.route.slug ||
    after.route.outputPath !== before.route.outputPath ||
    after.route.isExplicitFile !== before.route.isExplicitFile
  ) {
    throw new TypeError(
      "Content plugins must preserve sourcePath, sourceRelativePath, and route identity.",
    );
  }
}

function assertPageIdentity(before: BuiltPage, after: BuiltPage): void {
  if (
    after.source !== before.source ||
    after.route !== before.route ||
    after.outputPath !== before.outputPath
  ) {
    throw new TypeError("renderPage plugins must preserve source, route, and outputPath.");
  }
}

export class PluginRunner {
  readonly plugins: readonly BuilderPlugin[];
  readonly diagnostics: PluginDiagnostic[];
  #config: ResolvedBuilderConfig;
  readonly #options: CreatePluginRunnerOptions;

  constructor(plugins: readonly BuilderPlugin[], options: CreatePluginRunnerOptions) {
    this.plugins = orderPlugins(plugins);
    this.#config = options.config;
    this.#options = options;
    this.diagnostics = options.diagnostics ?? [];
  }

  get config(): ResolvedBuilderConfig {
    return this.#config;
  }

  #context(plugin: BuilderPlugin): PluginContext {
    const config = this.#config;
    return Object.freeze({
      config,
      root: config.root,
      outputRoot: this.#options.outputRoot,
      cacheRoot: config.resolvedPaths.cache,
      mode: this.#options.mode,
      logger: this.#options.logger,
      addDependency: (node: string, dependency: string) => {
        this.#options.addDependency?.(node, dependency);
      },
      addDiagnostic: (diagnostic: Omit<PluginDiagnostic, "plugin">) => {
        this.diagnostics.push({ ...diagnostic, plugin: plugin.name });
      },
      readProjectFile: async (relativePath: string) =>
        readFile(await resolveFileInsideRoot(config.root, relativePath, "Plugin read path")),
      emitFile: async (relativePath: string, contents: string | Uint8Array) => {
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

  async #call<T>(plugin: BuilderPlugin, hook: keyof BuilderPlugin, callback: () => Promise<T>): Promise<T> {
    try {
      return await callback();
    } catch (error) {
      throw new BuilderError(
        "PLUGIN_FAILED",
        `Plugin '${plugin.name}' failed in ${String(hook)}.`,
        { cause: error, details: { plugin: plugin.name, hook } },
      );
    }
  }

  async applyConfig(): Promise<ResolvedBuilderConfig> {
    for (const plugin of this.plugins) {
      if (!plugin.config) continue;
      const replacement = await this.#call(plugin, "config", async () =>
        plugin.config?.(this.#config));
      if (replacement) this.#config = replacement;
    }
    return this.#config;
  }

  async buildStart(): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.buildStart) await this.#call(plugin, "buildStart", async () => plugin.buildStart?.(this.#context(plugin)));
    }
  }

  async contentLoaded(entry: NormalizedContentEntry): Promise<NormalizedContentEntry> {
    let current = entry;
    for (const plugin of this.plugins) {
      if (!plugin.contentLoaded) continue;
      const replacement = await this.#call(plugin, "contentLoaded", async () => {
        const candidate = await plugin.contentLoaded?.(current, this.#context(plugin));
        if (candidate) assertContentIdentity(current, candidate);
        return candidate;
      });
      if (replacement) current = replacement;
    }
    return current;
  }

  async transformContent(entry: NormalizedContentEntry): Promise<NormalizedContentEntry> {
    let current = entry;
    for (const plugin of this.plugins) {
      if (!plugin.transformContent) continue;
      const replacement = await this.#call(plugin, "transformContent", async () => {
        const candidate = await plugin.transformContent?.(current, this.#context(plugin));
        if (candidate) assertContentIdentity(current, candidate);
        return candidate;
      });
      if (replacement) current = replacement;
    }
    return current;
  }

  async renderPage(page: BuiltPage): Promise<BuiltPage> {
    let current = page;
    for (const plugin of this.plugins) {
      if (!plugin.renderPage) continue;
      const replacement = await this.#call(plugin, "renderPage", async () => {
        const candidate = await plugin.renderPage?.(current, this.#context(plugin));
        if (candidate) assertPageIdentity(current, candidate);
        return candidate;
      });
      if (replacement) current = replacement;
    }
    return current;
  }

  async generateBundle(bundle: BuildBundle): Promise<void> {
    for (const plugin of this.plugins) {
      if (!plugin.generateBundle) continue;
      const context = this.#context(plugin);
      const scopedBundle: BuildBundle = Object.freeze({
        ...bundle,
        emitFile: context.emitFile,
      });
      await this.#call(plugin, "generateBundle", async () =>
        plugin.generateBundle?.(scopedBundle, context));
    }
  }

  async buildEnd(result: BuildResult): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.buildEnd) await this.#call(plugin, "buildEnd", async () =>
        plugin.buildEnd?.(result, this.#context(plugin)));
    }
  }
}

export function createPluginRunner(
  plugins: readonly BuilderPlugin[],
  options: CreatePluginRunnerOptions,
): PluginRunner {
  return new PluginRunner(plugins, options);
}
