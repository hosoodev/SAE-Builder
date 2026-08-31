# Content Model

## Core Front Matter

Every `.md` or `.mdx` entry is validated at build time.

```ts
interface CoreFrontMatter {
  title: string;
  description: string;
  slug: string;
  layout?: string;
  locale?: string;
  translationKey?: string;
  date?: string;
  updated?: string;
  draft?: boolean;
  noindex?: boolean;
  canonical?: string;
  image?: string;
  ogTemplate?: string;
  schemaType?: "WebPage" | "Article" | "WebApplication";
  breadcrumbs?: Array<{ name: string; url: string }>;
  collection?: string;
  tags?: string[];
  scripts?: string[];
  styles?: string[];
  sitemap?: { priority?: number; changefreq?: string };
}
```

`title`, `description`, and `slug` are required. Dates use `YYYY-MM-DD`.
Unknown fields are preserved for a site's templates, while known fields are
strictly typed. A future collection schema may extend, but not weaken, the core
schema.

## Routing rules

- A slug starts with `/`, contains no query/hash/backslash or traversal
  segment, and is normalized to a trailing slash except for explicit files.
- `/` maps to `dist/index.html`; `/guide/a/` maps to
  `dist/guide/a/index.html`.
- Duplicate normalized slugs fail the build.
- Drafts are excluded from production. `noindex` pages may render but are
  excluded from sitemap and feeds.
- An explicit external canonical is allowed, but is excluded from sitemap.

## Normalized page record

The loader produces source path, collection, validated Front Matter, raw body,
rendered body, route, canonical, asset references, and dependency identifiers.
Downstream modules consume this record instead of reparsing files.

## Markdown and MDX trust model

Markdown is authored repository content and may opt into raw HTML only through
project configuration. The default escapes raw HTML. MDX is declarative: only
registered static components and literal attributes are accepted. Imports,
exports, expressions, and arbitrary JavaScript execution fail the build.

Heading ids, GFM tables, footnotes, safe external-link attributes, and code
blocks are generated through a unified AST pipeline, never regular expressions.

## Collections

`defineCollection()` adds a directory contract and an optional runtime schema
without weakening Core Front Matter. `ContentRepository`/`ContentQuery` expose
collection selection, `filter`/`where`, deterministic sort, pagination,
tag/category indexes, and related-content lookup. The final repository is also
available as `BuildResult.content`.

## Social and breadcrumb metadata

When `og.enabled` is configured and `image` is absent, Builder creates a hashed
1200×630 page OG image from the page title, description, collection, and site
name. `ogTemplate` selects a configured self-contained SVG template; Builder
never downloads fonts or external SVG resources. An explicit `image` always
wins.

`breadcrumbs` supplies visible-navigation-aligned ancestors for
`BreadcrumbList`; Builder appends the current page. This is opt-in because Core
does not invent human labels for route segments.
