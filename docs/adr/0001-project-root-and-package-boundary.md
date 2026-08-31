# ADR 0001: Project-root CLI and package boundary

- Status: accepted
- Date: 2026-08-27

## Decision

`@hosoodev/sae-builder` is a TypeScript ESM package with a public `defineConfig` API and
`sae` binary. The CLI resolves configuration and all project paths from the
caller's working directory. Builder package directories are never implicit
consumer directories.

## Consequences

Enjuso can depend on the workspace package without copying build scripts. Tests
can create isolated fixture roots. All filesystem operations require explicit
root-safe resolution, which adds validation but prevents cross-project output
and traversal bugs.
