import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";

import { build, check, clean } from "../../src/build/index.js";
import { BuilderError } from "../../src/core/index.js";

async function write(root: string, relative: string, contents: string): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

async function snapshot(root: string): Promise<Record<string, string>> {
  const output: Record<string, string> = {};
  async function visit(directory: string): Promise<void> {
    for (const entry of (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else output[path.relative(root, target).replaceAll("\\", "/")] =
        (await readFile(target)).toString("base64");
    }
  }
  await visit(root);
  return output;
}

interface FixtureOptions {
  hashAssets?: boolean;
  sitemap?: boolean;
  minifyHtml?: boolean;
  clean?: boolean;
  forbiddenElements?: readonly string[];
  forbiddenClasses?: readonly string[];
  warningsAsErrors?: boolean;
  descriptionLength?: { min?: number; max?: number };
  ogEnabled?: boolean;
  ogTemplate?: boolean;
  plugins?: string;
  integrations?: string;
}

async function fixture(options: FixtureOptions = {}): Promise<string> {
  const temporaryRoot = path.join(process.cwd(), ".test-tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, "sae-builder-"));
  await write(root, "builder.config.mjs", `export default {
    site: {
      name: "Fixture Site",
      url: "https://example.test",
      language: "en-US",
      defaultLocale: "en",
      locales: ["en"]
    },
    assets: {
      hash: ${options.hashAssets ?? true},
      minify: true,
      styles: { styles: "src/styles.css" },
      scripts: { tool: "src/tool.ts" }
    },
    build: {
      clean: ${options.clean ?? true},
      minifyHtml: ${options.minifyHtml ?? false}
    },
    og: {
      enabled: ${options.ogEnabled ?? false},
      assets: { logo: "logo.svg" },
      templates: ${options.ogTemplate === false ? "{}" : '{ default: "og/default.svg" }'}
    },
    seo: {
      sitemap: ${options.sitemap ?? true},
      descriptionLength: ${JSON.stringify(options.descriptionLength ?? { min: 50, max: 160 })},
      feed: { description: "Fixture site feed" }
    },
    integrations: ${options.integrations ?? "{}"},
    lint: {
      forbiddenElements: ${JSON.stringify(options.forbiddenElements ?? [])},
      forbiddenClasses: ${JSON.stringify(options.forbiddenClasses ?? [])},
      warningsAsErrors: ${options.warningsAsErrors ?? false}
    },
    plugins: ${options.plugins ?? "[]"}
  };\n`);
  await write(root, "templates/layouts/default.html", `<!doctype html>
<html lang="{{lang}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{{{head}}}
</head>
  <body><!-- removable build comment -->{{> header}}<main>{{{content}}}</main></body>
</html>\n`);
  await write(root, "templates/partials/header.html", `<header><nav aria-label="Primary"><a href="/">Home</a><a href="/about">About</a><a href="/rss.xml">RSS</a><a href="/favicon.txt">Favicon</a><a href="/assets/manifest.json">Manifest</a></nav></header>\n`);
  await write(root, "content/index.mdx", `---
title: "Fixture site home page"
description: "A complete description for the deterministic fixture home page."
slug: "/"
locale: "en"
updated: "2026-08-27"
scripts:
  - tool
---
# Fixture home

## How does this fixture work?

It renders complete static HTML and loads one explicit enhancement script.

[Read about the fixture](/about/)
`);
  if (options.ogTemplate !== false) {
  await write(root, "templates/og/default.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="{{width}}" height="{{height}}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <image href="{{logo}}" width="24" height="24"/>
    <text x="40" y="80" font-family="{{fontFamily}}">{{category}} {{title}} {{subtitle}} {{siteName}}</text>
  </svg>`);
  await write(root, "public/logo.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#123456"/></svg>`);
  }
  await write(root, "content/pages/about.md", `---
title: "About the deterministic fixture"
description: "Background information about this deterministic Builder fixture."
slug: "/about"
locale: "en"
updated: "2026-08-27"
---
# About this fixture

This page intentionally has no JavaScript entry.

[Return home](/)
`);
  await write(root, "src/styles.css", `@import "tailwindcss";
main { @apply mx-auto max-w-3xl px-4 py-8; }
`);
  await write(root, "src/tool.ts", `document.documentElement.dataset.tool = "ready";\n`);
  await write(root, "public/favicon.txt", "fixture\n");
  return root;
}

function lifecyclePlugins(traceKey: string): string {
  return `(() => {
    const key = ${JSON.stringify(traceKey)};
    const trace = globalThis[key] ?? (globalThis[key] = []);
    const createPlugin = (name, enforce) => ({
      name,
      ...(enforce === undefined ? {} : { enforce }),
      config(config) {
        trace.push("config:" + name);
        return config;
      },
      buildStart() {
        trace.push("buildStart:" + name);
      },
      contentLoaded(entry) {
        trace.push("contentLoaded:" + name + ":" + entry.sourceRelativePath);
        if (name !== "normal") return;
        return {
          ...entry,
          renderedBody: entry.renderedBody + "\\n<p id='content-loaded-marker'>loaded</p>"
        };
      },
      transformContent(entry) {
        trace.push("transformContent:" + name + ":" + entry.sourceRelativePath);
        if (name !== "normal") return;
        return {
          ...entry,
          renderedBody: entry.renderedBody + "\\n<p id='transform-marker'>transformed</p>"
        };
      },
      renderPage(page) {
        trace.push("renderPage:" + name + ":" + page.route);
        if (name !== "normal") return;
        return {
          ...page,
          html: page.html.replace(
            "</main>",
            "<p id='render-marker'>rendered</p></main>"
          )
        };
      },
      async generateBundle(bundle) {
        trace.push("generateBundle:" + name);
        if (name === "pre") {
          await bundle.emitFile("plugin/generated.txt", "generated\\n");
        }
      },
      async buildEnd(_result, context) {
        trace.push("buildEnd:" + name);
        if (name === "post") {
          await context.emitFile("plugin/ended.txt", "ended\\n");
        }
      }
    });
    return [
      createPlugin("normal"),
      createPlugin("post", "post"),
      createPlugin("pre", "pre")
    ];
  })()`;
}

test("consumer-root build emits deterministic HTML-first output", async () => {
  const root = await fixture();
  try {
    const first = await build({ root, mode: "production" });
    assert.equal(first.pages.length, 2);
    const home = await readFile(path.join(root, "dist/index.html"), "utf8");
    const about = await readFile(path.join(root, "dist/about/index.html"), "utf8");
    assert.match(home, /<h1 id="fixture-home">/);
    assert.match(home, /<script type="module" src="\/assets\/tool\.[a-f0-9]{10}\.js"><\/script>/);
    assert.doesNotMatch(about, /tool\.[a-f0-9]{10}\.js/);
    assert.match(about, /<script type="application\/ld\+json">/);

    const manifest = JSON.parse(
      await readFile(path.join(root, "dist/assets/manifest.json"), "utf8"),
    ) as Record<string, string>;
    const css = await readFile(path.join(root, "dist", manifest.styles.slice(1)), "utf8");
    assert.doesNotMatch(css, /@apply|@import\s+["']tailwindcss/);
    assert.equal(await readFile(path.join(root, "dist/favicon.txt"), "utf8"), "fixture\n");
    await stat(path.join(root, "dist/sitemap.xml"));
    await stat(path.join(root, "dist/rss.xml"));
    await stat(path.join(root, "dist/robots.txt"));

    const before = await snapshot(path.join(root, "dist"));
    await build({ root, mode: "production" });
    const after = await snapshot(path.join(root, "dist"));
    assert.deepEqual(after, before);

    const checked = await check({ root, mode: "production" });
    assert.equal(checked.written, false);
    assert.deepEqual(await snapshot(path.join(root, "dist")), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("configured automatic OG images are hashed, linked, cached, and check-safe", async () => {
  const root = await fixture({ ogEnabled: true });
  try {
    const first = await build({ root, mode: "production" });
    const home = await readFile(path.join(root, "dist/index.html"), "utf8");
    const match = /<meta property="og:image" content="https:\/\/example\.test(\/assets\/og\/home\.[a-f0-9]{12}\.png)">/u.exec(home);
    assert.ok(match);
    const relativeOg = match[1]?.slice(1);
    assert.ok(relativeOg);
    const ogFile = path.join(root, "dist", ...relativeOg.split("/"));
    const signature = (await readFile(ogFile)).subarray(0, 8).toString("hex");
    assert.equal(signature, "89504e470d0a1a0a");
    assert.equal(first.assets["og:/"], `/${relativeOg}`);

    const beforeMtime = (await stat(ogFile)).mtimeMs;
    const second = await build({ root, mode: "production" });
    assert.equal(second.incremental.renderedPages, 0);
    assert.equal(second.incremental.reusedPages, 2);
    assert.equal((await stat(ogFile)).mtimeMs, beforeMtime);
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const checkRoot = await fixture({ ogEnabled: true });
  try {
    const result = await check({ root: checkRoot, mode: "production" });
    assert.equal(result.assets["og:/"].startsWith("/assets/og/home."), true);
    await assert.rejects(
      () => stat(path.join(checkRoot, ".builder-cache")),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT",
    );
  } finally {
    await rm(checkRoot, { recursive: true, force: true });
  }
});

test("automatic OG generation skips pages when no site template is configured", async () => {
  const root = await fixture({ ogEnabled: true, ogTemplate: false });
  try {
    const result = await build({ root, mode: "production" });
    assert.equal(Object.keys(result.assets).some((name) => name.startsWith("og:")), false);
    const home = await readFile(path.join(root, "dist/index.html"), "utf8");
    assert.doesNotMatch(home, /property="og:image"/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("build runs the complete plugin lifecycle in deterministic phase and enforce order", async () => {
  const traceKey = `__sae_builder_lifecycle_${process.pid}_${Date.now()}`;
  const state = globalThis as typeof globalThis & Record<string, unknown>;
  state[traceKey] = [];
  const root = await fixture({ plugins: lifecyclePlugins(traceKey) });

  try {
    const result = await build({ root, mode: "production" });
    const pluginOrder = ["pre", "normal", "post"];
    const sources = ["index.mdx", "pages/about.md"];
    const routes = ["/", "/about"];
    const expected = [
      ...pluginOrder.map((name) => `config:${name}`),
      ...pluginOrder.map((name) => `buildStart:${name}`),
      ...sources.flatMap((source) =>
        pluginOrder.map((name) => `contentLoaded:${name}:${source}`)),
      ...sources.flatMap((source) =>
        pluginOrder.map((name) => `transformContent:${name}:${source}`)),
      ...routes.flatMap((route) =>
        pluginOrder.map((name) => `renderPage:${name}:${route}`)),
      ...pluginOrder.map((name) => `generateBundle:${name}`),
      ...pluginOrder.map((name) => `buildEnd:${name}`),
    ];
    assert.deepEqual(state[traceKey], expected);

    const home = await readFile(path.join(root, "dist/index.html"), "utf8");
    assert.match(home, /id=['"]content-loaded-marker['"]/u);
    assert.match(home, /id=['"]transform-marker['"]/u);
    assert.match(home, /id=['"]render-marker['"]/u);
    assert.equal(
      await readFile(path.join(root, "dist/plugin/generated.txt"), "utf8"),
      "generated\n",
    );
    assert.equal(
      await readFile(path.join(root, "dist/plugin/ended.txt"), "utf8"),
      "ended\n",
    );
    assert.equal(result.pages.every(({ outputPath }) => outputPath.startsWith(path.join(root, "dist"))), true);
  } finally {
    delete state[traceKey];
    await rm(root, { recursive: true, force: true });
  }
});

test("check executes plugin emissions without writing output", async () => {
  const root = await fixture({
    plugins: `[{
      name: "check-emitter",
      async buildStart(context) {
        await context.emitFile("plugin/start.txt", "start\\n");
      },
      async generateBundle(bundle) {
        await bundle.emitFile("plugin/bundle.txt", "bundle\\n");
      },
      async buildEnd(_result, context) {
        await context.emitFile("plugin/end.txt", "end\\n");
      }
    }]`,
  });

  try {
    const result = await check({ root, mode: "production" });
    assert.equal(result.written, false);
    assert.equal(result.incremental.renderedPages, 2);
    assert.equal(result.incremental.reusedPages, 0);
    assert.deepEqual(result.incremental.writtenFiles, []);
    assert.deepEqual(result.incremental.unchangedFiles, []);
    assert.deepEqual(result.incremental.removedFiles, []);
    await assert.rejects(
      () => stat(path.join(root, "dist")),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generateBundle and buildEnd emissions participate in output ownership", async () => {
  const cases = [
    {
      name: "generateBundle",
      outputPath: "favicon.txt",
      plugins: `[{
        name: "bundle-collision",
        async generateBundle(bundle) {
          await bundle.emitFile("favicon.txt", "plugin\\n");
        }
      }]`,
    },
    {
      name: "buildEnd",
      outputPath: "rss.xml",
      plugins: `[{
        name: "end-collision",
        async buildEnd(_result, context) {
          await context.emitFile("rss.xml", "plugin\\n");
        }
      }]`,
    },
  ] as const;

  for (const item of cases) {
    const root = await fixture({ plugins: item.plugins });
    try {
      await assert.rejects(
        () => build({ root, mode: "production" }),
        (error: unknown) => {
          assert.ok(error instanceof BuilderError, item.name);
          assert.equal(error.code, "BUILD_FAILED", item.name);
          assert.equal(error.details?.outputPath, item.outputPath, item.name);
          assert.ok(
            Array.isArray(error.details?.owners)
              && error.details.owners.some((owner) =>
                typeof owner === "string" && owner.startsWith("plugin:")),
            item.name,
          );
          return true;
        },
      );
      await assert.rejects(
        () => stat(path.join(root, "dist")),
        (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("plugin diagnostics fail before publication, including buildEnd and warnings-as-errors", async () => {
  const cases = [
    {
      name: "buildEnd error",
      warningsAsErrors: false,
      message: "terminal plugin diagnostic",
      plugins: `[{
        name: "diagnostic-end",
        buildEnd(_result, context) {
          context.addDiagnostic({ severity: "error", message: "terminal plugin diagnostic" });
        }
      }]`,
    },
    {
      name: "warning as error",
      warningsAsErrors: true,
      message: "promoted plugin warning",
      plugins: `[{
        name: "diagnostic-warning",
        buildStart(context) {
          context.addDiagnostic({ severity: "warning", message: "promoted plugin warning" });
        }
      }]`,
    },
  ] as const;

  for (const item of cases) {
    const root = await fixture({
      plugins: item.plugins,
      warningsAsErrors: item.warningsAsErrors,
    });
    try {
      await assert.rejects(
        () => build({ root, mode: "production" }),
        (error: unknown) => {
          assert.ok(error instanceof BuilderError, item.name);
          assert.equal(error.code, "CHECK_FAILED", item.name);
          const diagnostics = error.details?.diagnostics;
          assert.ok(Array.isArray(diagnostics), item.name);
          assert.ok(diagnostics.some((diagnostic) =>
            Boolean(diagnostic)
              && typeof diagnostic === "object"
              && (diagnostic as { message?: string }).message === item.message
              && (diagnostic as { severity?: string }).severity === "error"), item.name);
          return true;
        },
      );
      await assert.rejects(
        () => stat(path.join(root, "dist")),
        (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("renderPage plugins cannot mutate route identity", async () => {
  const root = await fixture({
    plugins: `[{
      name: "route-mutator",
      renderPage(page) {
        return { ...page, route: "/moved" };
      }
    }]`,
  });

  try {
    await assert.rejects(
      () => build({ root, mode: "production" }),
      (error: unknown) => error instanceof BuilderError
        && error.code === "PLUGIN_FAILED"
        && error.details?.plugin === "route-mutator"
        && error.details?.hook === "renderPage",
    );
    await assert.rejects(
      () => stat(path.join(root, "dist")),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("config hook replacements are revalidated before filesystem work", async () => {
  const root = await fixture({
    plugins: `[{
      name: "invalid-config",
      config(config) {
        return { ...config, site: { ...config.site, name: "" } };
      }
    }]`,
  });
  try {
    await assert.rejects(
      () => build({ root, mode: "production" }),
      (error: unknown) => error instanceof BuilderError && error.code === "CONFIG_INVALID",
    );
    await assert.rejects(
      () => stat(path.join(root, "dist")),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("clean builds remove stale output while preserving unchanged mtimes and reporting incremental stats", async () => {
  const root = await fixture({ clean: true });
  const fixedMtime = new Date("2001-01-01T00:00:00.000Z");

  try {
    await build({ root, mode: "production" });
    const home = path.join(root, "dist/index.html");
    const about = path.join(root, "dist/about/index.html");
    const stale = path.join(root, "dist/stale.txt");
    await Promise.all([
      utimes(home, fixedMtime, fixedMtime),
      utimes(about, fixedMtime, fixedMtime),
      writeFile(stale, "stale\n", "utf8"),
    ]);
    const fixedHomeMtime = (await stat(home)).mtimeMs;
    const fixedAboutMtime = (await stat(about)).mtimeMs;
    await appendFile(
      path.join(root, "content/index.mdx"),
      "\nThis sentence changes only the home page body.\n",
      "utf8",
    );

    const result = await build({ root, mode: "production" });
    assert.equal((await stat(home)).mtimeMs > fixedHomeMtime, true);
    assert.equal((await stat(about)).mtimeMs, fixedAboutMtime);
    await assert.rejects(
      () => stat(stale),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT",
    );
    assert.equal(result.incremental.renderedPages, 1);
    assert.equal(result.incremental.reusedPages, 1);
    assert.deepEqual(result.incremental.invalidatedOutputs, ["output:/"]);
    assert.ok(result.incremental.writtenFiles.includes("index.html"));
    assert.ok(result.incremental.unchangedFiles.includes("about/index.html"));
    assert.ok(result.incremental.removedFiles.includes("stale.txt"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("non-clean builds preserve stale output and report byte-identical files as unchanged", async () => {
  const root = await fixture({ clean: false });

  try {
    await build({ root, mode: "production" });
    const stale = path.join(root, "dist/preserved.txt");
    await writeFile(stale, "preserved\n", "utf8");

    const result = await build({ root, mode: "production" });
    assert.equal(await readFile(stale, "utf8"), "preserved\n");
    assert.equal(result.incremental.renderedPages, 0);
    assert.equal(result.incremental.reusedPages, 2);
    assert.deepEqual(result.incremental.invalidatedOutputs, []);
    assert.deepEqual(result.incremental.writtenFiles, []);
    assert.deepEqual(result.incremental.removedFiles, []);
    assert.ok(result.incremental.unchangedFiles.includes("index.html"));
    assert.ok(result.incremental.unchangedFiles.includes("about/index.html"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("build and clean reject output or cache paths that overlap source roots", async () => {
  const temporaryRoot = path.join(process.cwd(), ".test-tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, "unsafe-paths-"));
  const source = path.join(root, "generated/content/index.md");
  try {
    await write(root, "builder.config.mjs", `export default {
      site: { name: "Unsafe", url: "https://example.test" },
      paths: { output: "generated", content: "generated/content" }
    };\n`);
    await write(root, "generated/content/index.md", "# protected source\n");
    await assert.rejects(
      () => build({ root }),
      (error: unknown) => error instanceof BuilderError && error.code === "PATH_INVALID",
    );
    await stat(source);
    await assert.rejects(
      () => clean({ root }),
      (error: unknown) => error instanceof BuilderError && error.code === "PATH_INVALID",
    );
    await stat(source);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("output ownership rejects public, asset, page, and SEO artifact collisions before publication", async () => {
  const cases: Array<{
    name: string;
    options?: FixtureOptions;
    outputPath: string;
    prepare(root: string): Promise<void>;
  }> = [
    {
      name: "public and RSS",
      outputPath: "rss.xml",
      prepare: (root) => write(root, "public/rss.xml", "owned by public\n"),
    },
    {
      name: "page and asset manifest",
      outputPath: "assets/manifest.json",
      prepare: (root) => write(root, "content/manifest.md", `---
title: "Manifest collision"
description: "This page deliberately collides with the generated asset manifest."
slug: "/assets/manifest.json"
---
# Manifest collision
`),
    },
    {
      name: "public and compiled asset",
      options: { hashAssets: false },
      outputPath: "assets/styles.css",
      prepare: (root) => write(root, "public/assets/styles.css", "owned by public\n"),
    },
  ];

  for (const item of cases) {
    const root = await fixture(item.options);
    try {
      await item.prepare(root);
      await assert.rejects(
        () => build({ root, mode: "production" }),
        (error: unknown) => {
          assert.ok(error instanceof BuilderError, item.name);
          assert.equal(error.code, "BUILD_FAILED", item.name);
          assert.equal(error.details?.outputPath, item.outputPath, item.name);
          assert.match(error.message, /collision/iu, item.name);
          return true;
        },
      );
      await assert.rejects(
        () => stat(path.join(root, "dist")),
        (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("generated and public paths satisfy link diagnostics", async () => {
  const root = await fixture();
  try {
    const result = await build({ root, mode: "production" });
    assert.equal(result.diagnostics.some(({ ruleId }) => ruleId === "link/broken-internal"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("build minifyHtml applies the conservative document minifier", async () => {
  const root = await fixture({ minifyHtml: true });
  try {
    await build({ root, mode: "production" });
    const html = await readFile(path.join(root, "dist/index.html"), "utf8");
    assert.doesNotMatch(html, /removable build comment/u);
    assert.match(html, /It renders complete static HTML and loads one explicit enhancement script\./u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("robots follows sitemap and development preview configuration", async () => {
  const root = await fixture();
  try {
    await build({ root, mode: "production" });
    const production = await readFile(path.join(root, "dist/robots.txt"), "utf8");
    assert.match(production, /^Sitemap: https:\/\/example\.test\/sitemap\.xml$/mu);
    assert.match(production, /^Allow: \/$/mu);

    await build({ root, mode: "development" });
    const preview = await readFile(path.join(root, "dist/robots.txt"), "utf8");
    assert.match(preview, /^User-agent: \*\nDisallow: \/$/mu);
    assert.doesNotMatch(preview, /^Sitemap:/mu);
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const withoutSitemap = await fixture({ sitemap: false });
  try {
    await build({ root: withoutSitemap, mode: "production" });
    const robots = await readFile(path.join(withoutSitemap, "dist/robots.txt"), "utf8");
    assert.doesNotMatch(robots, /^Sitemap:/mu);
    await assert.rejects(
      () => stat(path.join(withoutSitemap, "dist/sitemap.xml")),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT",
    );
  } finally {
    await rm(withoutSitemap, { recursive: true, force: true });
  }
});

test("production integrations generate head tags, Daum verification, and ads.txt", async () => {
  const root = await fixture({
    integrations: JSON.stringify({
      naverAnalytics: "naver123",
      naverSiteVerification: "verify123",
      daumSiteVerification: "hash:signed==",
      googleAnalytics: "G-ABC123",
      googleAdSense: "ca-pub-1234567890",
    }),
  });
  try {
    await build({ root, mode: "production" });
    const html = await readFile(path.join(root, "dist/index.html"), "utf8");
    const robots = await readFile(path.join(root, "dist/robots.txt"), "utf8");
    const ads = await readFile(path.join(root, "dist/ads.txt"), "utf8");
    assert.match(html, /wcs\.pstatic\.net\/wcslog\.js/u);
    assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-ABC123/u);
    assert.match(html, /name="naver-site-verification" content="verify123"/u);
    assert.match(html, /name="google-adsense-account" content="ca-pub-1234567890"/u);
    assert.match(robots, /#DaumWebMasterTool:hash:signed==\n$/u);
    assert.equal(ads, "google.com, pub-1234567890, DIRECT, f08c47fec0942fa0\n");

    await build({ root, mode: "development" });
    const previewHtml = await readFile(path.join(root, "dist/index.html"), "utf8");
    const previewRobots = await readFile(path.join(root, "dist/robots.txt"), "utf8");
    assert.doesNotMatch(previewHtml, /wcslog|googletagmanager|adsbygoogle/u);
    assert.doesNotMatch(previewRobots, /DaumWebMasterTool/u);
    await assert.rejects(
      () => stat(path.join(root, "dist/ads.txt")),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("builder forwards forbidden element and class lint configuration", async () => {
  const root = await fixture({ forbiddenElements: ["na*"], forbiddenClasses: ["never-matches-*"] });
  try {
    await assert.rejects(
      () => check({ root, mode: "production" }),
      (error: unknown) => {
        assert.ok(error instanceof BuilderError);
        const diagnostics = error.details?.diagnostics;
        assert.ok(Array.isArray(diagnostics));
        assert.ok(diagnostics.some((item) =>
          Boolean(item) && typeof item === "object" && (item as { ruleId?: string }).ruleId === "html/forbidden-element"));
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("builder forwards site-specific meta description length guidance", async () => {
  const root = await fixture({ descriptionLength: { min: 98, max: 98 } });
  try {
    const result = await check({ root, mode: "production" });
    const diagnostic = result.diagnostics.find(({ ruleId }) => ruleId === "seo/description-length");
    assert.ok(diagnostic);
    assert.match(diagnostic.message, /configured minimum is 98/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the checked-in package demo consumes the current Builder contract", async () => {
  const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const result = await check({ root: demoRoot, mode: "production" });

  assert.equal(result.written, false);
  assert.deepEqual(result.pages.map(({ route }) => route).sort(), [
    "/",
    "/guides/getting-started",
  ]);
  assert.match(result.assets.styles, /^\/assets\/styles\.[a-f0-9]{10}\.css$/u);
  assert.match(result.assets.demo, /^\/assets\/demo\.[a-f0-9]{10}\.js$/u);
  assert.equal(result.diagnostics.some(({ severity }) => severity === "error"), false);
});
