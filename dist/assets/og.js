import path from "node:path";
import { getOrCreateArtifact, materializeIfChanged } from "./artifact-cache.js";
import { escapeXml } from "./escape.js";
import { hashContent, stableStringify } from "./hashing.js";
import { assertSelfContainedSvg } from "./svg.js";
function dimension(value, name) {
    if (!Number.isInteger(value) || value < 1 || value > 4096) {
        throw new RangeError(`${name} must be an integer between 1 and 4096.`);
    }
    return value;
}
export function renderOgSvg(data, options) {
    const width = dimension(options.width ?? 1200, "OG width");
    const height = dimension(options.height ?? 630, "OG height");
    const template = options.template;
    assertSelfContainedSvg(template, "OG template");
    const wrap = (value, maximum, count) => {
        let remaining = value.replace(/\s+/gu, " ").trim();
        const lines = [];
        while (remaining && lines.length < count) {
            const characters = [...remaining];
            if (characters.length <= maximum || lines.length === count - 1) {
                lines.push(remaining);
                break;
            }
            const candidate = characters.slice(0, maximum + 1).join("");
            const space = candidate.lastIndexOf(" ");
            const split = space >= Math.floor(maximum * 0.55)
                ? [...candidate.slice(0, space)].length
                : maximum;
            lines.push(characters.slice(0, split).join("").trim());
            remaining = characters.slice(split).join("").trim();
        }
        return Array.from({ length: count }, (_, index) => lines[index] ?? "");
    };
    const titleLines = wrap(data.title, 24, 2);
    const subtitleLines = wrap(data.subtitle ?? "", 42, 3);
    const values = {
        width: String(width),
        height: String(height),
        fontFamily: options.fontFamily ?? "Arial, sans-serif",
        title: data.title,
        titleLine1: titleLines[0] ?? "",
        titleLine2: titleLines[1] ?? "",
        subtitle: data.subtitle ?? "",
        subtitleLine1: subtitleLines[0] ?? "",
        subtitleLine2: subtitleLines[1] ?? "",
        subtitleLine3: subtitleLines[2] ?? "",
        category: data.category ?? "",
        siteName: data.siteName ?? "",
    };
    for (const [name, value] of Object.entries(options.assets ?? {})) {
        if (name in values)
            throw new Error(`OG asset placeholder '${name}' is reserved.`);
        if (!/^data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/u.test(value)) {
            throw new Error(`OG asset '${name}' must be a supported image data URI.`);
        }
        values[name] = value;
    }
    const rendered = template.replace(/\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g, (placeholder, key) => {
        if (!(key in values))
            throw new Error(`Unknown OG template placeholder: ${placeholder}`);
        return escapeXml(values[key] ?? "");
    });
    if (/\{\{[^}]+\}\}/.test(rendered))
        throw new Error("OG template contains an unresolved placeholder.");
    assertSelfContainedSvg(rendered, "Rendered OG template");
    return rendered;
}
function safeStem(value) {
    return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "og";
}
export async function generateOgImage(data, options) {
    const planned = await planOgImage(data, options);
    const filePath = path.join(options.outputDirectory, planned.filename);
    await materializeIfChanged(filePath, planned.contents);
    return Object.freeze({
        width: planned.width,
        height: planned.height,
        format: planned.format,
        svgHash: planned.svgHash,
        contentHash: planned.contentHash,
        filename: planned.filename,
        filePath,
        url: planned.url,
        cacheHit: planned.cacheHit,
    });
}
export async function planOgImage(data, options) {
    const { default: sharp } = await import("sharp");
    const width = dimension(options.width ?? 1200, "OG width");
    const height = dimension(options.height ?? 630, "OG height");
    const format = options.format ?? "png";
    const quality = options.quality ?? 90;
    if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
        throw new RangeError("OG quality must be an integer between 1 and 100.");
    }
    const svg = renderOgSvg(data, options);
    const svgHash = hashContent(svg);
    const recipeHash = hashContent(stableStringify({
        kind: "og-image-v1",
        svgHash,
        width,
        height,
        format,
        quality,
        fonts: (options.fonts ?? []).map((font) => ({
            hash: hashContent(font.contents),
            weight: font.weight ?? 400,
            style: font.style ?? "normal",
        })),
        sharp: sharp.versions.sharp,
    }));
    const create = async () => {
        let pipeline = sharp(Buffer.from(svg), { failOn: "error" }).resize({ width, height, fit: "fill" });
        pipeline = format === "webp"
            ? pipeline.webp({ quality, effort: 4 })
            : pipeline.png({ compressionLevel: 9, adaptiveFiltering: false });
        const encoded = await pipeline.toBuffer({ resolveWithObject: true });
        return { contents: encoded.data, width: encoded.info.width, height: encoded.info.height };
    };
    const artifact = options.cacheDirectory
        ? await getOrCreateArtifact(path.join(options.cacheDirectory, "og"), recipeHash, format, create)
        : {
            ...await create(),
            contentHash: "",
            cacheHit: false,
        };
    const contentHash = artifact.contentHash || hashContent(artifact.contents);
    const hashedFilename = `${safeStem(options.filenameStem ?? "og")}.${contentHash.slice(0, 12)}.${format}`;
    const publicPath = (options.publicPath ?? "/og").replace(/\/$/, "");
    return Object.freeze({
        width: artifact.width,
        height: artifact.height,
        format,
        svgHash,
        contentHash,
        filename: hashedFilename,
        url: `${publicPath}/${encodeURIComponent(hashedFilename)}`,
        contents: new Uint8Array(artifact.contents),
        cacheHit: artifact.cacheHit,
    });
}
//# sourceMappingURL=og.js.map