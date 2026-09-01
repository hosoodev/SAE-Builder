# SAE Builder Architecture

## Scope

`@hosoodev/sae-builder` is a reusable, HTML-first static-site builder. It knows how to
load content, render templates, compile project assets, emit SEO artifacts, and
validate the result. It does not know the business meaning of an address,
currency, calculator, or other consumer domain.

The active project is always the CLI working directory. Builder source and
consumer source never share an implicit root.

## Package boundary

```text
SAE-Builder/                   reusable build-time package and `sae` CLI
sites/enjuso/                  consumer content, templates, assets, and address code
sites/enjuso/runtime/          deployment-neutral address API handlers
<project>/dist/                portable static output
<project>/.builder-cache/      disposable build cache
```

- Core: configuration, filesystem safety, content, Markdown, templates,
  routing, asset compilation, metadata, schema helpers, feeds, and validation.
- Plugin: optional behavior useful to more than one consumer. Plugins are
  explicitly registered and are trusted local build-time code.
- Site: API adapters, domain models, formatting, UI, copy, and presets.

## Module shape

```text
src/
  cli/          command parsing and process exit mapping
  core/         config, context, errors, logger, public types
  filesystem/   root-safe paths, discovery, copy, atomic output helpers
  content/      Front Matter loading and normalized page records
  markdown/     unified pipeline and restricted MDX handling
  template/     layouts, partials, escaping, dependency collection
  routing/      slug normalization and output mapping
  assets/       CSS/TypeScript entries, responsive images, OG rendering engine
  seo/          metadata, JSON-LD, sitemap, RSS, robots, HTML checks
  plugin/       typed hooks and deterministic ordering
  build/        orchestration, graph, cache, build/check result
```

## Build pipeline

```text
load/normalize config -> config hooks -> discover/parse/validate Markdown -> content hooks
-> route and locale links -> compile assets/plan OG -> invalidate dependency graph
-> reuse safe unchanged pages or render layout/partials -> render hooks
-> sitemap/RSS/robots -> bundle/build-end hooks -> ownership + SEO/AEO validation
-> stage -> selectively publish changed bytes -> persist cache
```

Content HTML is complete without client JavaScript. A page receives a script
only when its Front Matter or layout explicitly names a configured entry.

## Public contract

```ts
import { defineConfig, build, check } from "@hosoodev/sae-builder";
```

CLI commands are `sae build`, `sae check`, `sae clean`, `sae dev`, and
`sae inspect <url-or-route>`.

`sae dev` reports startup, debounced source changes, incremental rebuild
statistics, and HTTP method/path/status/timing. Request logs intentionally omit
the query string, request body, headers, and client address so a consumer's
private form input does not become application log data.

## Determinism and safety

- Output derives only from source bytes and configuration; current time is not
  inserted into HTML, hashes, feeds, or schema.
- Every input and output path is resolved under an explicit project root.
- Slugs cannot escape the output root; symlinks and template traversal are
  rejected at trust boundaries.
- Core, public, SEO, page, OG, and plugin paths pass one case-insensitive
  ownership check before publication.
- Production output is staged, then only byte-different files are published.
  Unchanged files keep their mtimes and `build.clean` controls stale removal.
- Output, cache, stage, content, templates, and asset trust boundaries reject
  symlinks/junctions rather than following them.

## Milestone gate

Builder Phase 2 completed before Enjuso implementation began. Phase 3-7 now
uses `sites/enjuso` as the first regression consumer while all address API,
mapping, formatting, presets, and interactive UI remain site-owned.
