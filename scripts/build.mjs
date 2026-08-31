import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
  cp,
  stat
} from "node:fs/promises";

import matter from "gray-matter";
import { compile as compileMdx } from "@mdx-js/mdx";
import * as esbuild from "esbuild";
import { transform as transformCss } from "lightningcss";
import sharp from "sharp";
import config from "../builder.config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resolveRoot = p => path.resolve(ROOT, p);

const paths = Object.fromEntries(
  Object.entries(config.paths).map(([k, v]) => [k, resolveRoot(v)])
);

const cacheFile = path.join(paths.cache, "manifest.json");

const escapeHtml = value =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const hash = content =>
  crypto.createHash("sha256").update(content).digest("hex").slice(0, 10);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }

  return files;
}

async function fileExists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function loadPlugins() {
  const plugins = [];

  for (const pluginPath of config.plugins ?? []) {
    const mod = await import(pathToFileURL(resolveRoot(pluginPath)).href + `?t=${Date.now()}`);
    plugins.push(mod.default);
  }

  return plugins;
}

async function loadPartials() {
  const partialDir = path.join(paths.templates, "partials");
  const result = {};

  if (!await fileExists(partialDir)) return result;

  for (const file of await walk(partialDir)) {
    if (!file.endsWith(".html")) continue;
    result[path.basename(file, ".html")] = await readFile(file, "utf8");
  }

  return result;
}

function renderTemplate(template, data, partials = {}) {
  let html = template;

  html = html.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
    const partial = partials[name] ?? "";
    return renderTemplate(partial, data, partials);
  });

  html = html.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, key) => {
    return getValue(data, key) ?? "";
  });

  html = html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    return escapeHtml(getValue(data, key) ?? "");
  });

  return html;
}

function getValue(obj, dotted) {
  return dotted.split(".").reduce((acc, key) => acc?.[key], obj);
}

function markdownToHtmlBasic(markdown) {
  // MVP renderer: MDX compiler is used for syntax validation,
  // while this intentionally small renderer keeps output predictable.
  // Replace with unified/remark pipeline in v0.2.
  const lines = markdown.split(/\r?\n/);
  let html = "";
  let paragraph = [];

  const flush = () => {
    if (!paragraph.length) return;
    html += `<p>${inline(paragraph.join(" "))}</p>\n`;
    paragraph = [];
  };

  const inline = value =>
    escapeHtml(value)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      html += `<h${level}>${inline(heading[2])}</h${level}>\n`;
      continue;
    }

    paragraph.push(line.trim());
  }

  flush();
  return html;
}

async function compileContent(file) {
  const raw = await readFile(file, "utf8");
  const parsed = matter(raw);

  // Validate MDX syntax. Full JSX component rendering is a planned v0.2 feature.
  await compileMdx(parsed.content, { jsx: false });

  const page = {
    source: file,
    frontmatter: parsed.data,
    body: parsed.content,
    html: markdownToHtmlBasic(parsed.content)
  };

  return page;
}

function createJsonLd(page, canonical) {
  const fm = page.frontmatter;

  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": fm.schemaType || "WebPage",
    name: fm.title,
    description: fm.description,
    url: canonical,
    inLanguage: fm.locale || config.site.defaultLocale,
    dateModified: fm.updated || undefined,
    isPartOf: {
      "@type": "WebSite",
      name: config.site.name,
      url: config.site.url
    }
  }).replaceAll("</script", "<\\/script");
}

async function buildCss() {
  const input = path.join(ROOT, "src/styles.css");
  const css = await readFile(input, "utf8");

  // Tailwind v4 processing is normally done through its PostCSS/CLI integration.
  // This reference builder keeps a deterministic fallback CSS build here.
  // In production, wire @tailwindcss/postcss or Tailwind compile API.
  let output = Buffer.from(css);

  if (config.build.minifyCss && !css.includes("@apply")) {
    output = transformCss({
      filename: "styles.css",
      code: Buffer.from(css),
      minify: true
    }).code;
  }

  const name = config.build.hashAssets
    ? `styles.${hash(output)}.css`
    : "styles.css";

  await mkdir(path.join(paths.output, "assets"), { recursive: true });
  await writeFile(path.join(paths.output, "assets", name), output);
  return `/assets/${name}`;
}

async function buildJs() {
  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, "src/main.ts")],
    bundle: true,
    minify: config.build.minifyJs,
    format: "esm",
    write: false,
    target: "es2022"
  });

  const code = result.outputFiles[0].contents;
  const name = config.build.hashAssets
    ? `main.${hash(code)}.js`
    : "main.js";

  await mkdir(path.join(paths.output, "assets"), { recursive: true });
  await writeFile(path.join(paths.output, "assets", name), code);
  return `/assets/${name}`;
}

async function optimizeImages() {
  if (!await fileExists(paths.public)) return;

  const images = (await walk(paths.public))
    .filter(file => /\.(png|jpe?g)$/i.test(file));

  for (const input of images) {
    const rel = path.relative(paths.public, input);
    const base = rel.replace(/\.[^.]+$/, "");

    for (const width of config.images.widths) {
      for (const format of config.images.formats) {
        const target = path.join(paths.output, base + `-${width}.${format}`);
        await mkdir(path.dirname(target), { recursive: true });

        let pipeline = sharp(input).resize({ width, withoutEnlargement: true });

        if (format === "webp") pipeline = pipeline.webp({ quality: config.images.quality });
        if (format === "avif") pipeline = pipeline.avif({ quality: config.images.quality });

        await pipeline.toFile(target);
      }
    }
  }
}

function outputFileForSlug(slug) {
  if (slug === "/") return path.join(paths.output, "index.html");
  return path.join(paths.output, slug.replace(/^\/|\/$/g, ""), "index.html");
}

function canonicalForSlug(slug) {
  return new URL(slug, config.site.url).href;
}

async function generateSitemap(pages) {
  if (!config.seo.sitemap) return;

  const urls = pages.map(page => {
    const fm = page.frontmatter;
    return [
      "<url>",
      `<loc>${escapeHtml(canonicalForSlug(fm.slug))}</loc>`,
      fm.updated ? `<lastmod>${escapeHtml(fm.updated)}</lastmod>` : "",
      fm.changefreq ? `<changefreq>${escapeHtml(fm.changefreq)}</changefreq>` : "",
      fm.priority ? `<priority>${escapeHtml(fm.priority)}</priority>` : "",
      "</url>"
    ].join("");
  }).join("");

  await writeFile(
    path.join(paths.output, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
  );
}

async function generateRss(pages) {
  if (!config.seo.rss) return;

  const items = pages
    .filter(page => page.frontmatter.slug !== "/")
    .map(page => {
      const fm = page.frontmatter;
      const url = canonicalForSlug(fm.slug);
      return `<item><title>${escapeHtml(fm.title)}</title><link>${escapeHtml(url)}</link><guid>${escapeHtml(url)}</guid><description>${escapeHtml(fm.description)}</description></item>`;
    }).join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeHtml(config.site.name)}</title><link>${escapeHtml(config.site.url)}</link><description>${escapeHtml(config.site.name)}</description>${items}</channel></rss>`;

  await writeFile(path.join(paths.output, "rss.xml"), rss);
}

async function generateRobots() {
  if (!config.seo.robots) return;

  await writeFile(
    path.join(paths.output, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${new URL("/sitemap.xml", config.site.url).href}\n`
  );
}

async function createOgPlaceholder(page) {
  if (!config.seo.openGraph) return null;

  // v0.1 uses generated SVG -> sharp PNG/WebP. Later switch to configurable OG template engine.
  const title = escapeHtml(page.frontmatter.title).slice(0, 80);
  const svg = `
  <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#ffffff"/>
    <rect x="80" y="80" width="1040" height="470" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
    <text x="120" y="270" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#0f172a">${title}</text>
    <text x="120" y="350" font-family="Arial, sans-serif" font-size="30" fill="#475569">${escapeHtml(config.site.name)}</text>
  </svg>`;

  const filename = `${hash(page.frontmatter.slug)}.webp`;
  const target = path.join(paths.output, "og", filename);
  await mkdir(path.dirname(target), { recursive: true });
  await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(target);

  return `/og/${filename}`;
}

async function loadCache() {
  try {
    return JSON.parse(await readFile(cacheFile, "utf8"));
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  await mkdir(paths.cache, { recursive: true });
  await writeFile(cacheFile, JSON.stringify(cache, null, 2));
}

async function main() {
  if (config.build.clean) {
    await rm(paths.output, { recursive: true, force: true });
  }

  await mkdir(paths.output, { recursive: true });

  const plugins = await loadPlugins();

  let runtimeConfig = structuredClone(config);
  for (const plugin of plugins) {
    if (plugin.onConfig) runtimeConfig = await plugin.onConfig(runtimeConfig) ?? runtimeConfig;
  }

  if (await fileExists(paths.public)) {
    await cp(paths.public, paths.output, { recursive: true });
  }

  const [layout, partials, cssAsset, jsAsset, previousCache] = await Promise.all([
    readFile(path.join(paths.templates, "layout.html"), "utf8"),
    loadPartials(),
    buildCss(),
    buildJs(),
    loadCache()
  ]);

  const contentFiles = (await walk(paths.content))
    .filter(file => /\.(md|mdx)$/i.test(file));

  const pages = [];
  const nextCache = {};

  for (const file of contentFiles) {
    const raw = await readFile(file);
    const digest = hash(raw);
    nextCache[file] = digest;

    let page = await compileContent(file);

    for (const plugin of plugins) {
      if (plugin.onContent) page = await plugin.onContent(page) ?? page;
    }

    if (!page.frontmatter.title || !page.frontmatter.description || !page.frontmatter.slug) {
      throw new Error(`Missing required front matter: ${file}`);
    }

    const canonical = canonicalForSlug(page.frontmatter.slug);
    const ogImage = await createOgPlaceholder(page);
    const jsonLd = createJsonLd(page, canonical);

    const headExtra = [
      `<link rel="stylesheet" href="${cssAsset}">`,
      `<script type="module" src="${jsAsset}"></script>`,
      `<meta property="og:title" content="${escapeHtml(page.frontmatter.title)}">`,
      `<meta property="og:description" content="${escapeHtml(page.frontmatter.description)}">`,
      `<meta property="og:url" content="${escapeHtml(canonical)}">`,
      ogImage ? `<meta property="og:image" content="${escapeHtml(new URL(ogImage, config.site.url).href)}">` : "",
      `<script type="application/ld+json">${jsonLd}</script>`
    ].join("\n");

    let html = renderTemplate(layout, {
      title: page.frontmatter.title,
      description: page.frontmatter.description,
      canonical,
      lang: page.frontmatter.locale || runtimeConfig.site.defaultLocale,
      siteName: runtimeConfig.site.name,
      year: new Date().getFullYear(),
      headExtra,
      content: page.html
    }, partials);

    for (const plugin of plugins) {
      if (plugin.onPage) html = await plugin.onPage(html, page) ?? html;
    }

    const outputFile = outputFileForSlug(page.frontmatter.slug);
    await mkdir(path.dirname(outputFile), { recursive: true });
    await writeFile(outputFile, html);
    pages.push(page);
  }

  await optimizeImages();
  await generateSitemap(pages);
  await generateRss(pages);
  await generateRobots();
  await saveCache(nextCache);

  for (const plugin of plugins) {
    if (plugin.onBuildEnd) {
      await plugin.onBuildEnd({ pages, config: runtimeConfig, output: paths.output });
    }
  }

  const changed = Object.entries(nextCache)
    .filter(([file, digest]) => previousCache[file] !== digest).length;

  console.log(`Build complete: ${pages.length} pages (${changed} changed content files)`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
