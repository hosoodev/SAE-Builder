import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  generateOgImage,
  optimizeImage,
  renderOgSvg,
  renderPictureHtml,
} from "../../src/assets/index.js";

const SOURCE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160">
  <rect width="320" height="160" fill="#2563eb"/>
  <circle cx="160" cy="80" r="48" fill="#ffffff"/>
</svg>`;
const TEST_OG_TEMPLATE = `<svg xmlns="http://www.w3.org/2000/svg" width="{{width}}" height="{{height}}">
  <text font-family="{{fontFamily}}">{{category}} {{title}} {{subtitle}} {{siteName}}</text>
</svg>`;

async function filesBelow(directory: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else result.push(target);
    }
  };
  await visit(directory);
  return result.sort();
}

async function mtimes(files: readonly string[]): Promise<Record<string, number>> {
  return Object.fromEntries(await Promise.all(files.map(async file => [file, (await stat(file)).mtimeMs])));
}

test("image optimization caps widths, emits intrinsic dimensions, and reuses content cache", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sae-image-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source.svg");
  const output = path.join(root, "output");
  const cache = path.join(root, "cache");
  await writeFile(source, SOURCE_SVG, "utf8");

  const options = {
    outputDirectory: output,
    cacheDirectory: cache,
    publicPath: "/media",
    widths: [100, 320, 640],
    formats: ["webp", "avif"] as const,
    quality: 80,
  };
  const first = await optimizeImage(source, options);
  assert.equal(first.sourceWidth, 320);
  assert.equal(first.sourceHeight, 160);
  assert.deepEqual([...new Set(first.variants.map(variant => variant.width))], [100, 320]);
  assert.equal(first.variants.every(variant => variant.width <= first.sourceWidth), true);
  assert.equal(first.variants.every(variant => variant.width / variant.height === 2), true);
  assert.equal(first.variants.every(variant => !variant.cacheHit), true);
  assert.equal(first.variants.every(variant => variant.filename.includes(variant.contentHash.slice(0, 12))), true);

  const tracked = [...await filesBelow(output), ...await filesBelow(cache)];
  const before = await mtimes(tracked);
  await new Promise(resolve => setTimeout(resolve, 30));
  const second = await optimizeImage(source, options);
  const after = await mtimes(tracked);
  assert.deepEqual(second.variants.map(variant => variant.filename), first.variants.map(variant => variant.filename));
  assert.equal(second.variants.every(variant => variant.cacheHit), true);
  assert.deepEqual(after, before, "cache hits must not rewrite cached objects, recipes, or output files");

  const picture = renderPictureHtml(second, {
    alt: `A "quoted" & <unsafe> image`,
    loading: "eager",
    fetchPriority: "high",
    sizes: "(max-width: 600px) 100vw, 320px",
    className: "hero-image",
  });
  assert.ok(picture.indexOf('type="image/avif"') < picture.indexOf('type="image/webp"'));
  assert.match(picture, /width="320" height="160"/);
  assert.match(picture, /loading="eager"/);
  assert.match(picture, /fetchpriority="high"/);
  assert.match(picture, /alt="A &quot;quoted&quot; &amp; &lt;unsafe&gt; image"/);
  assert.doesNotMatch(picture, /640w/);
});

test("OG SVG data is XML escaped and raster hashes are deterministic", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sae-og-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = path.join(root, "output");
  const cache = path.join(root, "cache");
  const data = {
    title: "A & <B>",
    subtitle: `A "quoted" subtitle`,
    category: "Guide",
    siteName: "Example",
  };
  const svg = renderOgSvg(data, { template: TEST_OG_TEMPLATE });
  assert.match(svg, /A &amp; &lt;B&gt;/);
  assert.match(svg, /A &quot;quoted&quot; subtitle/);
  assert.doesNotMatch(svg, /<B>/);

  const options = {
    outputDirectory: output,
    cacheDirectory: cache,
    publicPath: "/og",
    filenameStem: "guide-card",
    template: TEST_OG_TEMPLATE,
  };
  const first = await generateOgImage(data, options);
  const firstMtime = (await stat(first.filePath)).mtimeMs;
  await new Promise(resolve => setTimeout(resolve, 30));
  const second = await generateOgImage(data, options);
  assert.equal(second.svgHash, first.svgHash);
  assert.equal(second.contentHash, first.contentHash);
  assert.equal(second.filename, first.filename);
  assert.equal(second.cacheHit, true);
  assert.equal((await stat(second.filePath)).mtimeMs, firstMtime);

  const changed = await generateOgImage({ ...data, title: "Changed title" }, options);
  assert.notEqual(changed.svgHash, first.svgHash);
  assert.notEqual(changed.contentHash, first.contentHash);
  assert.notEqual(changed.filename, first.filename);
  const generatedFiles = [...await filesBelow(output), ...await filesBelow(cache)];
  assert.equal(generatedFiles.some(file => /\.(?:ttf|otf|woff2?)$/i.test(file)), false);
});

test("OG templates reject external resources", () => {
  assert.throws(
    () => renderOgSvg({ title: "Unsafe" }, {
      template: `<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/image.png"/></svg>`,
    }),
    /external URLs or files/,
  );
});

test("image optimization rejects SVG external resources before rasterization", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sae-svg-safety-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "unsafe.svg");
  await writeFile(
    source,
    `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="https://example.com/a.png"/></svg>`,
  );
  await assert.rejects(
    optimizeImage(source, {
      outputDirectory: path.join(root, "output"),
      cacheDirectory: path.join(root, "cache"),
      widths: [10],
      formats: ["webp"],
    }),
    /external URLs or files/,
  );
});
