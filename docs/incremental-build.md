# Incremental Build Design

## Graph

Nodes use stable, project-relative ids:

```text
content:guides/a.mdx
template:guide
partial:header
asset:styles
plugin:example
output:/guides/a/
```

An edge means the left node depends on the right node. Invalidation walks the
reverse graph from changed fingerprints to affected output nodes.

## Fingerprints

Source nodes use SHA-256 over bytes. Virtual nodes use a stable serialization
of relevant options and Builder version. Timestamps, absolute workspace paths,
and directory iteration order are excluded.

## Cache files

`.builder-cache/manifest.json` contains the versioned graph, content-to-route
map, and published page hashes. Writes use a process/sequence-specific temporary
file and rename. Unknown versions, missing output hashes, modified output bytes,
or corrupt JSON cause a safe page render instead of trusting stale output.
Cache deletion never deletes source files.

## Invalidation rules

- Content change: its page plus feeds and sitemap metadata.
- Layout change: pages using that layout.
- Partial change: layouts/partials that transitively include it, then pages.
- Page-specific script/style change: only pages referencing that entry.
- Shared site metadata, config, or Builder version change: full build.
- Translation-set change: pages are re-rendered so reciprocal hreflang stays complete.
- Compiled CSS/JS byte change: pages that reference the entry are re-rendered.
- Unlink: remove recorded outputs and invalidate global indexes.

On a warm build without page-affecting plugins, unaffected published HTML is
hash-verified and reused without template rendering. New pages, missing output,
manually changed output, and affected graph nodes render normally. Every build
still regenerates the small global sitemap/feed/robots plans and validates the
complete final HTML set. Plugins currently disable page reuse because the API
does not yet declare hook purity or external-file fingerprints.

All files are first written to a unique stage tree. `syncOutputTree()` copies
only byte-different files into `dist`, preserves identical file mtimes, and
removes stale files only when `build.clean` is true. Symlinks are errors in both
the staged and published trees.

## Delivery phases

Phase 4 is connected to the public build path: reverse invalidation selects page
renders, publication is byte-selective, watch events are coalesced, unlink
cleanup follows `build.clean`, and `sae inspect` exposes page evidence. The
`BuildResult.incremental` counters make rendered/reused and
written/unchanged/removed behavior observable in tests and benchmarks.
