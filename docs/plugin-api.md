# Plugin API

Plugins are optional, trusted, local build-time modules. Core behavior required
by every site is not hidden behind a plugin during Phase 0-2, but the build
context exposes stable hook boundaries for Phase 7.

```ts
type MaybePromise<T> = T | Promise<T>;

interface BuilderPlugin {
  name: string;
  enforce?: "pre" | "post";
  config?(config: ResolvedBuilderConfig):
    MaybePromise<ResolvedBuilderConfig | void>;
  buildStart?(context: PluginContext): MaybePromise<void>;
  contentLoaded?(entry: NormalizedContentEntry, context: PluginContext):
    MaybePromise<NormalizedContentEntry | void>;
  transformContent?(entry: NormalizedContentEntry, context: PluginContext):
    MaybePromise<NormalizedContentEntry | void>;
  renderPage?(page: BuiltPage, context: PluginContext):
    MaybePromise<BuiltPage | void>;
  generateBundle?(bundle: BuildBundle, context: PluginContext):
    MaybePromise<void>;
  buildEnd?(result: BuildResult, context: PluginContext): MaybePromise<void>;
}
```

## Ordering and failures

Ordering is stable: `pre`, normal, then `post`, preserving declaration order in
each group. Names must be non-empty and unique. A hook failure is wrapped with
the plugin name and hook name and stops the production build.

The lifecycle is `config`, `buildStart`, all `contentLoaded` calls, all
`transformContent` calls, page `renderPage` calls, `generateBundle`, then
`buildEnd`. A config replacement is passed through Core validation again and
may not add, remove, or reorder the plugin set. Content hooks must preserve
source/route identity; render hooks must preserve source, route, and output path.

## Context capabilities

The context provides read-only normalized config, project/output/cache roots,
logger, dependency registration, diagnostics, and root-safe emit/read helpers.
It does not expose Enjuso APIs or secrets.

All emitted files are buffered. Public files, Core pages/assets/SEO artifacts,
automatic OG assets, and every plugin emission pass the same ownership check
before anything is published. `bundle.emitFile` is scoped to the active plugin,
and `check` runs hooks without writing their emitted files.

## Compatibility

Phase 7 publishes `createPluginRunner`, `PluginRunner`, context, bundle,
diagnostic, and hook types from the package root. Hook inputs are immutable by
convention; replacements are returned explicitly for deterministic composition.
Plugins are trusted local build-time code. Page reuse is conservatively disabled
while any plugin is configured until a cacheability/purity contract is added.
