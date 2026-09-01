import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { normalizeCollectionDefinitions, } from "../content/collection.js";
import { validateI18nConfig } from "../i18n/index.js";
import { BuilderError } from "./errors.js";
import { serializePublicUrl } from "./url.js";
const pluginSchema = z.custom((value) => {
    if (!value || typeof value !== "object")
        return false;
    const plugin = value;
    return typeof plugin.name === "string"
        && plugin.name.trim().length > 0
        && (plugin.enforce === undefined || plugin.enforce === "pre" || plugin.enforce === "post");
}, "Invalid plugin declaration");
const collectionDefinitionSchema = z.custom((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    const definition = value;
    return typeof definition.name === "string"
        && (definition.directory === undefined || typeof definition.directory === "string")
        && (definition.schema === undefined || typeof definition.schema.parse === "function");
}, "Invalid collection definition");
const lengthGuidanceSchema = z.object({
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().nonnegative().optional(),
}).strict().refine(({ min, max }) => min === undefined || max === undefined || min <= max, { message: "Minimum length must not exceed maximum length." });
const configSchema = z.object({
    site: z.object({
        name: z.string().trim().min(1),
        url: z.url(),
        language: z.string().trim().min(1).default("en"),
        defaultLocale: z.string().trim().min(1).default("en"),
        locales: z.array(z.string().trim().min(1)).min(1).default(["en"]),
        organization: z.object({
            name: z.string().trim().min(1),
            url: z.url().optional(),
            logo: z.string().optional(),
        }).strict().optional(),
    }).strict(),
    paths: z.object({
        content: z.string().min(1).default("content"),
        templates: z.string().min(1).default("templates"),
        public: z.string().min(1).default("public"),
        output: z.string().min(1).default("dist"),
        cache: z.string().min(1).default(".builder-cache"),
    }).strict().default({
        content: "content",
        templates: "templates",
        public: "public",
        output: "dist",
        cache: ".builder-cache",
    }),
    content: z.object({
        collections: z.array(z.union([
            z.string().min(1),
            collectionDefinitionSchema,
        ])).default([]),
        allowRawHtml: z.boolean().default(false),
        mdxComponents: z.record(z.string().regex(/^[A-Z][A-Za-z0-9]*$/), z.object({
            tagName: z.string().regex(/^[a-z][a-z0-9-]*$/),
            allowedAttributes: z.array(z.string()).optional(),
            fixedAttributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
        }).strict()).default({}),
    }).strict().default({ collections: [], allowRawHtml: false, mdxComponents: {} }),
    i18n: z.object({
        defaultLocale: z.string().trim().min(1).optional(),
        locales: z.array(z.string().trim().min(1)).min(1).optional(),
        routing: z.enum(["prefix-all", "prefix-except-default"]).default("prefix-except-default"),
    }).strict().default({ routing: "prefix-except-default" }),
    build: z.object({
        clean: z.boolean().default(true),
        minifyHtml: z.boolean().default(false),
        trailingSlash: z.boolean().default(true),
    }).strict().default({ clean: true, minifyHtml: false, trailingSlash: true }),
    assets: z.object({
        hash: z.boolean().default(true),
        minify: z.boolean().default(true),
        styles: z.record(z.string(), z.string().min(1)).default({}),
        scripts: z.record(z.string(), z.string().min(1)).default({}),
        images: z.object({
            formats: z.array(z.enum(["webp", "avif"])).default(["webp", "avif"]),
            widths: z.array(z.number().int().positive()).default([480, 768, 1200]),
            quality: z.number().int().min(1).max(100).default(82),
        }).strict().default({ formats: ["webp", "avif"], widths: [480, 768, 1200], quality: 82 }),
    }).strict().default({
        hash: true,
        minify: true,
        styles: {},
        scripts: {},
        images: { formats: ["webp", "avif"], widths: [480, 768, 1200], quality: 82 },
    }),
    og: z.object({
        enabled: z.boolean().default(false),
        width: z.number().int().min(1).max(4096).default(1200),
        height: z.number().int().min(1).max(4096).default(630),
        format: z.enum(["png", "webp"]).default("png"),
        quality: z.number().int().min(1).max(100).default(90),
        fontFamily: z.string().trim().min(1).optional(),
        fonts: z.array(z.object({
            file: z.string().trim().min(1),
            weight: z.number().int().min(1).max(1000).default(400),
            style: z.enum(["normal", "italic"]).default("normal"),
        }).strict()).max(8).default([]),
        assets: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/u), z.string().trim().min(1)).default({}),
        templates: z.record(z.string(), z.string().min(1)).default({}),
    }).strict().default({
        enabled: false,
        width: 1200,
        height: 630,
        format: "png",
        quality: 90,
        fonts: [],
        assets: {},
        templates: {},
    }),
    seo: z.object({
        sitemap: z.boolean().default(true),
        rss: z.boolean().default(true),
        robots: z.boolean().default(true),
        jsonLd: z.boolean().default(true),
        descriptionLength: lengthGuidanceSchema.default({ min: 50, max: 160 }),
        feed: z.object({
            title: z.string().optional(),
            description: z.string().optional(),
        }).strict().default({}),
        robotsRules: z.array(z.object({
            userAgent: z.string().min(1),
            allow: z.array(z.string()).optional(),
            disallow: z.array(z.string()).optional(),
        }).strict()).default([{ userAgent: "*", allow: ["/"] }]),
    }).strict().default({
        sitemap: true,
        rss: true,
        robots: true,
        jsonLd: true,
        descriptionLength: { min: 50, max: 160 },
        feed: {},
        robotsRules: [{ userAgent: "*", allow: ["/"] }],
    }),
    integrations: z.object({
        naverAnalytics: z.string().regex(/^[A-Za-z0-9_-]+$/u).optional(),
        naverSiteVerification: z.string().regex(/^[A-Za-z0-9_-]+$/u).optional(),
        daumSiteVerification: z.string().regex(/^[A-Za-z0-9_-]+:[A-Za-z0-9+/_=-]+$/u).optional(),
        googleAnalytics: z.string().regex(/^G-[A-Z0-9]+$/u).optional(),
        googleAdSense: z.string().regex(/^ca-pub-[0-9]+$/u).optional(),
    }).strict().default({}),
    lint: z.object({
        forbiddenElements: z.array(z.string()).default([]),
        forbiddenClasses: z.array(z.string()).default([]),
        warningsAsErrors: z.boolean().default(false),
    }).strict().default({ forbiddenElements: [], forbiddenClasses: [], warningsAsErrors: false }),
    plugins: z.array(pluginSchema).default([]),
}).strict();
function normalizeSiteUrl(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new BuilderError("CONFIG_INVALID", "site.url must use http or https.");
    }
    url.pathname = url.pathname.replace(/\/*$/, "/");
    url.search = "";
    url.hash = "";
    return serializePublicUrl(url);
}
function assertRelativeProjectPath(label, value) {
    if (path.isAbsolute(value)
        || path.win32.isAbsolute(value)
        || path.posix.isAbsolute(value)
        || /^[A-Za-z]:/.test(value)
        || value.includes("\0")) {
        throw new BuilderError("CONFIG_INVALID", `${label} must be project-relative.`);
    }
    const segments = value.replaceAll("\\", "/").split("/");
    if (segments.includes("..")) {
        throw new BuilderError("CONFIG_INVALID", `${label} escapes the project root.`);
    }
}
export function defineConfig(config) {
    return config;
}
export function resolveConfig(input, root, configFile = path.join(root, "builder.config.mjs")) {
    const parsed = configSchema.safeParse(input);
    if (!parsed.success) {
        throw new BuilderError("CONFIG_INVALID", "Invalid Builder configuration.", {
            details: { issues: z.treeifyError(parsed.error) },
        });
    }
    const normalizedRoot = path.resolve(root);
    for (const [name, value] of Object.entries(parsed.data.paths)) {
        assertRelativeProjectPath(`paths.${name}`, value);
    }
    for (const [kind, entries] of Object.entries({
        styles: parsed.data.assets.styles,
        scripts: parsed.data.assets.scripts,
    })) {
        for (const [name, value] of Object.entries(entries)) {
            assertRelativeProjectPath(`assets.${kind}.${name}`, value);
        }
    }
    for (const [name, value] of Object.entries(parsed.data.og.templates)) {
        assertRelativeProjectPath(`og.templates.${name}`, value);
    }
    for (const [index, font] of parsed.data.og.fonts.entries()) {
        assertRelativeProjectPath(`og.fonts.${index}.file`, font.file);
    }
    for (const [name, value] of Object.entries(parsed.data.og.assets)) {
        assertRelativeProjectPath(`og.assets.${name}`, value);
    }
    const explicitSiteDefault = input.site.defaultLocale;
    const explicitI18nDefault = input.i18n?.defaultLocale;
    if (explicitSiteDefault && explicitI18nDefault && explicitSiteDefault !== explicitI18nDefault) {
        throw new BuilderError("CONFIG_INVALID", "site.defaultLocale and i18n.defaultLocale must agree when both are configured.");
    }
    const explicitSiteLocales = input.site.locales;
    const explicitI18nLocales = input.i18n?.locales;
    if (explicitSiteLocales
        && explicitI18nLocales
        && (explicitSiteLocales.length !== explicitI18nLocales.length
            || explicitSiteLocales.some((locale, index) => locale !== explicitI18nLocales[index]))) {
        throw new BuilderError("CONFIG_INVALID", "site.locales and i18n.locales must agree when both are configured.");
    }
    const defaultLocale = parsed.data.i18n.defaultLocale ?? parsed.data.site.defaultLocale;
    const locales = parsed.data.i18n.locales ?? parsed.data.site.locales;
    try {
        validateI18nConfig({
            defaultLocale,
            locales,
            routing: parsed.data.i18n.routing,
        });
    }
    catch (error) {
        const message = error instanceof Error && error.message === "locales must include defaultLocale."
            ? "site.locales must include site.defaultLocale."
            : error instanceof Error && error.message === "locales must not contain duplicates."
                ? "site.locales must not contain duplicates."
                : error instanceof Error
                    ? error.message
                    : "Invalid i18n configuration.";
        throw new BuilderError("CONFIG_INVALID", message, { cause: error });
    }
    let collections;
    try {
        collections = normalizeCollectionDefinitions(parsed.data.content.collections);
    }
    catch (error) {
        throw new BuilderError("CONFIG_INVALID", error instanceof Error ? error.message : "Invalid content collection configuration.", { cause: error });
    }
    const config = {
        ...parsed.data,
        site: {
            ...parsed.data.site,
            url: normalizeSiteUrl(parsed.data.site.url),
            defaultLocale,
            locales: [...locales],
        },
        content: {
            ...parsed.data.content,
            collections: [...collections],
        },
        i18n: {
            defaultLocale,
            locales: [...locales],
            routing: parsed.data.i18n.routing,
        },
    };
    return {
        ...config,
        root: normalizedRoot,
        configFile: path.resolve(configFile),
        resolvedPaths: {
            content: path.resolve(normalizedRoot, config.paths.content),
            templates: path.resolve(normalizedRoot, config.paths.templates),
            public: path.resolve(normalizedRoot, config.paths.public),
            output: path.resolve(normalizedRoot, config.paths.output),
            cache: path.resolve(normalizedRoot, config.paths.cache),
        },
    };
}
async function fileExists(file) {
    try {
        return (await stat(file)).isFile();
    }
    catch {
        return false;
    }
}
export async function loadConfig(root = process.cwd(), explicitConfigFile) {
    const normalizedRoot = path.resolve(root);
    const candidates = explicitConfigFile
        ? [path.resolve(normalizedRoot, explicitConfigFile)]
        : ["builder.config.mjs", "builder.config.js"].map((name) => path.join(normalizedRoot, name));
    const configFile = (await Promise.all(candidates.map(async (file) => [file, await fileExists(file)])))
        .find(([, exists]) => exists)?.[0];
    if (!configFile) {
        throw new BuilderError("CONFIG_NOT_FOUND", `No builder.config.mjs or builder.config.js found in ${normalizedRoot}.`);
    }
    try {
        const source = await readFile(configFile);
        const fingerprint = createHash("sha256").update(source).digest("hex");
        const module = await import(`${pathToFileURL(configFile).href}?v=${fingerprint}`);
        if (!module.default) {
            throw new BuilderError("CONFIG_INVALID", `${configFile} must have a default export.`);
        }
        return resolveConfig(module.default, normalizedRoot, configFile);
    }
    catch (error) {
        if (error instanceof BuilderError)
            throw error;
        throw new BuilderError("CONFIG_INVALID", `Unable to load ${configFile}.`, { cause: error });
    }
}
//# sourceMappingURL=config.js.map