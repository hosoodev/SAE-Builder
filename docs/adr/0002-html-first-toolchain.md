# ADR 0002: HTML-first content and asset toolchain

- Status: accepted
- Date: 2026-08-27

## Decision

Use unified/remark/rehype for Markdown AST processing, a deliberately small
escaped layout/partial engine, Tailwind v4 plus Lightning CSS for styles, and
esbuild for explicitly referenced TypeScript islands. React, Next.js, Webpack,
and page-wide hydration are not Core dependencies.

MDX is restricted to registered static components; build-time JavaScript from
content is not executed. Templates support escaped variables, raw trusted
rendered slots, partials, nested values, and a small fixed helper surface.

## Consequences

Generated content is readable without JavaScript and output remains portable.
The restricted MDX model is less flexible than application-framework MDX but
has a clear security and determinism boundary. Rich interactive behavior stays
in page-specific site entries.
