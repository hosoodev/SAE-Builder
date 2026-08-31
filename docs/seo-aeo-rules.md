# SEO and AEO Rules

## Production errors

- Missing/duplicate title, description, normalized slug, or canonical.
- Missing or multiple H1 elements.
- Broken internal links or links that escape the configured site base.
- Invalid JSON-LD or a schema URL inconsistent with the page canonical.
- Invalid locale/hreflang relation once i18n is enabled.
- Output path traversal or malformed sitemap/feed URL.

## Warnings

- Title or description outside configurable length guidance.
- Missing image alt text, heading-level jumps, orphan pages, and large JS.
- Question-like heading without an immediate meaningful answer paragraph,
  list, table, or definition list.
- Article `dateModified` not represented by explicit content metadata.

Warnings may be promoted to errors through config. Diagnostics include rule id,
source, route, and a useful message; their order is deterministic.

## Metadata and canonical policy

Every rendered page has one title, description, canonical, Open Graph title,
description, URL, type, and—when automatic OG or an explicit image is enabled—
an absolute image URL. Canonicals are absolute. Draft pages do not render
in production; noindex and external-canonical pages do not enter sitemap/feed.
`lastmod` comes only from explicit content metadata.

## Structured data

Core may generate `WebSite`, `Organization`, `WebPage`, `Article`,
`BreadcrumbList`, and `WebApplication` from visible metadata. FAQ schema is
opt-in and must match visible questions and answers. Ratings, reviews, authors,
or dates are never invented.

`WebApplication` pages also receive their containing `WebPage` node. Breadcrumb
schema is generated only from explicit Front Matter ancestors and the current
page, keeping structured data aligned with visible navigation.

## AEO policy

AEO checks semantic clarity, not crawler targeting. The HTML sent to crawlers
and users is identical, primary answers exist in initial HTML, and no keyword
stuffing or cloaking is permitted. Search-result URLs containing real user
addresses are never generated as programmatic index pages.
