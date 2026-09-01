import path from "node:path";
import { readFile } from "node:fs/promises";

import { getOrCreateArtifact, materializeIfChanged } from "./artifact-cache.js";
import { escapeHtmlAttribute } from "./escape.js";
import { hashContent, stableStringify } from "./hashing.js";
import { assertSelfContainedSvg } from "./svg.js";

export type OptimizedImageFormat = "webp" | "avif";

export interface OptimizeImageOptions {
  readonly outputDirectory: string;
  readonly cacheDirectory: string;
  readonly publicPath?: string;
  readonly widths?: readonly number[];
  readonly formats?: readonly OptimizedImageFormat[];
  readonly quality?: number;
  readonly filenameStem?: string;
}

export interface OptimizedImageVariant {
  readonly format: OptimizedImageFormat;
  readonly width: number;
  readonly height: number;
  readonly contentHash: string;
  readonly filename: string;
  readonly filePath: string;
  readonly url: string;
  readonly cacheHit: boolean;
}

export interface OptimizedImageResult {
  readonly sourcePath: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly variants: readonly OptimizedImageVariant[];
}

export interface PictureHtmlOptions {
  readonly alt: string;
  readonly loading?: "lazy" | "eager";
  readonly decoding?: "async" | "sync" | "auto";
  readonly fetchPriority?: "high" | "low" | "auto";
  readonly sizes?: string;
  readonly className?: string;
}

export type ImageHelperOptions = OptimizeImageOptions & PictureHtmlOptions;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateQuality(quality: number): number {
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new RangeError("Image quality must be an integer between 1 and 100.");
  }
  return quality;
}

function normalizedFormats(formats: readonly OptimizedImageFormat[]): OptimizedImageFormat[] {
  const unique = [...new Set(formats)];
  if (unique.length === 0 || unique.some(format => format !== "webp" && format !== "avif")) {
    throw new TypeError("At least one WebP or AVIF output format is required.");
  }
  return unique.sort(compareText);
}

function normalizedWidths(widths: readonly number[], sourceWidth: number): number[] {
  if (widths.length === 0 || widths.some(width => !Number.isInteger(width) || width <= 0)) {
    throw new RangeError("Image widths must be positive integers.");
  }
  return [...new Set(widths.map(width => Math.min(width, sourceWidth)))].sort((left, right) => left - right);
}

function safeStem(value: string): string {
  const stem = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return stem || "image";
}

function publicUrl(base: string, filename: string): string {
  const prefix = base === "/" ? "" : base.replace(/\/$/, "");
  return `${prefix}/${encodeURIComponent(filename)}`;
}

export async function optimizeImage(
  sourcePath: string,
  options: OptimizeImageOptions,
): Promise<OptimizedImageResult> {
  const { default: sharp } = await import("sharp");
  const source = await readFile(sourcePath);
  const sourceLooksLikeSvg = path.extname(sourcePath).toLowerCase() === ".svg"
    || /<svg\b/i.test(source.subarray(0, 4096).toString("utf8"));
  if (sourceLooksLikeSvg) assertSelfContainedSvg(source.toString("utf8"), "Source SVG");
  const metadata = await sharp(source, { failOn: "error" }).metadata();
  if (metadata.format === "svg" && !sourceLooksLikeSvg) {
    assertSelfContainedSvg(source.toString("utf8"), "Source SVG");
  }
  if (!metadata.width || !metadata.height) {
    throw new Error(`Image has no intrinsic dimensions: ${sourcePath}`);
  }

  const quality = validateQuality(options.quality ?? 82);
  const widths = normalizedWidths(options.widths ?? [480, 768, 1200, 1600], metadata.width);
  const formats = normalizedFormats(options.formats ?? ["webp", "avif"]);
  const stem = safeStem(options.filenameStem ?? path.parse(sourcePath).name);
  const sourceHash = hashContent(source);
  const variants: OptimizedImageVariant[] = [];

  for (const format of formats) {
    for (const width of widths) {
      const recipeHash = hashContent(stableStringify({
        kind: "responsive-image-v1",
        sourceHash,
        width,
        format,
        quality,
        sharp: sharp.versions.sharp,
      }));
      const artifact = await getOrCreateArtifact(
        path.join(options.cacheDirectory, "images"),
        recipeHash,
        format,
        async () => {
          let pipeline = sharp(source, { failOn: "error" }).resize({
            width,
            withoutEnlargement: true,
            fit: "inside",
          });
          pipeline = format === "webp"
            ? pipeline.webp({ quality, effort: 4 })
            : pipeline.avif({ quality, effort: 4 });
          const encoded = await pipeline.toBuffer({ resolveWithObject: true });
          return {
            contents: encoded.data,
            width: encoded.info.width,
            height: encoded.info.height,
          };
        },
      );
      const filename = `${stem}.${artifact.width}w.${artifact.contentHash.slice(0, 12)}.${format}`;
      const filePath = path.join(options.outputDirectory, filename);
      await materializeIfChanged(filePath, artifact.contents);
      variants.push(Object.freeze({
        format,
        width: artifact.width,
        height: artifact.height,
        contentHash: artifact.contentHash,
        filename,
        filePath,
        url: publicUrl(options.publicPath ?? "/assets/images", filename),
        cacheHit: artifact.cacheHit,
      }));
    }
  }

  variants.sort((left, right) => compareText(left.format, right.format) || left.width - right.width);
  return Object.freeze({
    sourcePath: path.resolve(sourcePath),
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    variants: Object.freeze(variants),
  });
}

function variantsFor(result: OptimizedImageResult, format: OptimizedImageFormat): OptimizedImageVariant[] {
  return result.variants.filter(variant => variant.format === format).sort((left, right) => left.width - right.width);
}

function srcset(variants: readonly OptimizedImageVariant[]): string {
  return variants.map(variant => `${variant.url} ${variant.width}w`).join(", ");
}

export function renderPictureHtml(result: OptimizedImageResult, options: PictureHtmlOptions): string {
  if (result.variants.length === 0) throw new Error("Cannot render a picture without optimized variants.");
  const avif = variantsFor(result, "avif");
  const webp = variantsFor(result, "webp");
  const fallbackSet = webp.length > 0 ? webp : avif;
  const fallback = fallbackSet.at(-1);
  if (!fallback) throw new Error("Cannot select an image fallback.");
  const sizes = options.sizes ? ` sizes="${escapeHtmlAttribute(options.sizes)}"` : "";
  const sources = [
    avif.length > 0 ? `<source type="image/avif" srcset="${escapeHtmlAttribute(srcset(avif))}"${sizes}>` : "",
    webp.length > 0 ? `<source type="image/webp" srcset="${escapeHtmlAttribute(srcset(webp))}"${sizes}>` : "",
  ].filter(Boolean).join("");
  const attributes = [
    `src="${escapeHtmlAttribute(fallback.url)}"`,
    `srcset="${escapeHtmlAttribute(srcset(fallbackSet))}"`,
    options.sizes ? `sizes="${escapeHtmlAttribute(options.sizes)}"` : "",
    `alt="${escapeHtmlAttribute(options.alt)}"`,
    `width="${fallback.width}"`,
    `height="${fallback.height}"`,
    `loading="${options.loading ?? "lazy"}"`,
    `decoding="${options.decoding ?? "async"}"`,
    options.fetchPriority ? `fetchpriority="${options.fetchPriority}"` : "",
    options.className ? `class="${escapeHtmlAttribute(options.className)}"` : "",
  ].filter(Boolean).join(" ");
  return `<picture>${sources}<img ${attributes}></picture>`;
}

/** Optimize a project image and return the complete static `<picture>` markup. */
export async function image(
  sourcePath: string,
  options: ImageHelperOptions,
): Promise<string> {
  const result = await optimizeImage(sourcePath, options);
  return renderPictureHtml(result, options);
}
