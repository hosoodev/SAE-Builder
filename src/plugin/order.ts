import type { BuilderPlugin } from "./types.js";

const rank = (plugin: BuilderPlugin): number =>
  plugin.enforce === "pre" ? 0 : plugin.enforce === "post" ? 2 : 1;

export function orderPlugins(plugins: readonly BuilderPlugin[]): BuilderPlugin[] {
  const names = new Set<string>();
  for (const plugin of plugins) {
    if (!plugin.name.trim()) {
      throw new Error("Plugin names must not be empty.");
    }
    if (names.has(plugin.name)) {
      throw new Error(`Duplicate plugin name: ${plugin.name}`);
    }
    names.add(plugin.name);
  }

  return plugins
    .map((plugin, index) => ({ plugin, index }))
    .sort((a, b) => rank(a.plugin) - rank(b.plugin) || a.index - b.index)
    .map(({ plugin }) => plugin);
}
