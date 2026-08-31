import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...await walk(p));
    else files.push(p);
  }
  return files;
}

const htmlFiles = (await walk("dist")).filter(f => f.endsWith(".html"));

if (!htmlFiles.length) throw new Error("No generated HTML found.");

for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");

  const h1 = html.match(/<h1\b/gi)?.length || 0;
  if (h1 !== 1) throw new Error(`${file}: expected exactly one H1, found ${h1}`);

  if (!/<title>.+<\/title>/is.test(html)) {
    throw new Error(`${file}: missing title`);
  }

  if (!/<meta name="description"/i.test(html)) {
    throw new Error(`${file}: missing meta description`);
  }

  if (!/<link rel="canonical"/i.test(html)) {
    throw new Error(`${file}: missing canonical`);
  }

  if (!/application\/ld\+json/i.test(html)) {
    throw new Error(`${file}: missing JSON-LD`);
  }
}

for (const required of ["dist/sitemap.xml", "dist/rss.xml", "dist/robots.txt"]) {
  try {
    await stat(required);
  } catch {
    throw new Error(`Missing generated file: ${required}`);
  }
}

console.log(`Check passed: ${htmlFiles.length} HTML pages`);
