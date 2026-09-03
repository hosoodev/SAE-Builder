import path from "node:path";
import { mkdir, readFile, rm, writeFile, } from "node:fs/promises";
import { hashContent, planCssEntries, planOgImage, planScriptEntries, stableStringify, writeAssetManifest, } from "../assets/index.js";
import { BuilderError, createBuildContext, loadConfig, resolveConfig, serializePublicUrl, } from "../core/index.js";
import { createContentRepository, loadContent, } from "../content/index.js";
import { assertInsideRoot, assertNoSymlinkPath, copyDirectory, discoverFiles, isInsideRoot, relativeInsideRoot, resolveFileInsideRoot, readTextFile, } from "../filesystem/index.js";
import { createTranslationAlternates, localizeRoute, renderHreflangTags, } from "../i18n/index.js";
import { buildMetadata, createArticleSchema, createBreadcrumbListSchema, createJsonLdGraph, createFaqPageSchema, createOrganizationSchema, createWebApplicationSchema, createWebPageSchema, createWebSiteSchema, daumWebmasterComment, diagnoseSeoSite, generateGoogleAdsTxt, generateRobotsTxt, generateRss, planLocalizedSitemaps, renderJsonLd, renderIntegrationHead, renderMetadataTags, resolveSiteUrl, } from "../seo/index.js";
import { FileTemplateLoader } from "../template/index.js";
import { createPluginRunner, } from "../plugin/index.js";
import { assertUniqueSlugs, outputPathForSlug } from "../routing/index.js";
import { applySiteBasePath } from "./base-path.js";
import { CACHE_VERSION, loadBuildCache, saveBuildCache, } from "./cache.js";
import { DependencyGraph } from "./graph.js";
import { minifyHtmlDocument } from "./html.js";
import { planInvalidation, syncOutputTree, } from "./incremental.js";
export const BUILDER_VERSION = "0.3.5";
let stageSequence = 0;
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function normalizedOutputPath(relativePath) {
    const normalized = relativePath.replaceAll("\\", "/").replace(/^\.\//u, "").normalize("NFC");
    if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => part === "..")) {
        throw new BuilderError("PATH_INVALID", `Invalid planned output path: ${relativePath}`);
    }
    return normalized;
}
function outputComparisonKey(relativePath) {
    return normalizedOutputPath(relativePath).toLowerCase();
}
function assertUniqueOutputOwnership(claims) {
    const ordered = claims
        .map((claim) => ({
        ...claim,
        relativePath: normalizedOutputPath(claim.relativePath),
        key: outputComparisonKey(claim.relativePath),
    }))
        .sort((left, right) => compareText(left.key, right.key) ||
        compareText(left.relativePath, right.relativePath) ||
        compareText(left.owner, right.owner));
    const claimedFiles = new Map();
    for (const claim of ordered) {
        const exact = claimedFiles.get(claim.key);
        if (exact) {
            throw new BuilderError("BUILD_FAILED", `Output path collision at ${JSON.stringify(claim.relativePath)} between ${exact.owner} and ${claim.owner}.`, {
                details: {
                    outputPath: claim.relativePath,
                    owners: [exact.owner, claim.owner],
                },
            });
        }
        const segments = claim.key.split("/");
        for (let length = 1; length < segments.length; length += 1) {
            const ancestor = claimedFiles.get(segments.slice(0, length).join("/"));
            if (ancestor) {
                throw new BuilderError("BUILD_FAILED", `Output file/directory collision between ${ancestor.owner} (${JSON.stringify(ancestor.relativePath)}) and ${claim.owner} (${JSON.stringify(claim.relativePath)}).`, {
                    details: {
                        outputPath: claim.relativePath,
                        owners: [ancestor.owner, claim.owner],
                    },
                });
            }
        }
        claimedFiles.set(claim.key, claim);
    }
}
function routeForOutputPath(relativePath) {
    const normalized = normalizedOutputPath(relativePath);
    if (normalized === "index.html")
        return "/";
    if (normalized.endsWith("/index.html")) {
        return `/${normalized.slice(0, -"/index.html".length)}`;
    }
    return `/${normalized}`;
}
function siteBasePath(siteUrl) {
    return new URL(siteUrl).pathname;
}
function manifestUnderSiteBase(manifest, siteUrl) {
    return Object.fromEntries(Object.entries(manifest).map(([name, publicPath]) => [
        name,
        new URL(resolveSiteUrl(siteUrl, publicPath)).pathname,
    ]));
}
function resolveSiteAssetUrl(siteUrl, value) {
    return value.startsWith("/")
        ? resolveSiteUrl(siteUrl, value)
        : serializePublicUrl(new URL(value, siteUrl));
}
function stagePathFor(config) {
    stageSequence += 1;
    const stage = path.join(config.resolvedPaths.cache, `stage-${process.pid}-${stageSequence}`);
    const safe = assertInsideRoot(config.root, stage);
    if (safe === config.root) {
        throw new BuilderError("PATH_INVALID", "The output staging path cannot be the project root.");
    }
    return safe;
}
function pathsOverlap(left, right) {
    return isInsideRoot(left, right) || isInsideRoot(right, left);
}
export function validateProjectPaths(config) {
    const output = assertInsideRoot(config.root, config.resolvedPaths.output);
    const cache = assertInsideRoot(config.root, config.resolvedPaths.cache);
    const sources = [
        config.resolvedPaths.content,
        config.resolvedPaths.templates,
        config.resolvedPaths.public,
    ].map((source) => assertInsideRoot(config.root, source));
    if (output === config.root || cache === config.root) {
        throw new BuilderError("PATH_INVALID", "paths.output and paths.cache cannot be the project root.");
    }
    if (pathsOverlap(output, cache)) {
        throw new BuilderError("PATH_INVALID", "paths.output and paths.cache must not overlap.");
    }
    for (const source of sources) {
        if (pathsOverlap(output, source) || pathsOverlap(cache, source)) {
            throw new BuilderError("PATH_INVALID", "paths.output and paths.cache must not contain, equal, or be contained by an input root.");
        }
    }
    if (isInsideRoot(output, config.configFile) || isInsideRoot(cache, config.configFile)) {
        throw new BuilderError("PATH_INVALID", "The config file cannot be inside output or cache.");
    }
}
function normalizePluginConfig(candidate, root, configFile) {
    const input = {
        site: candidate.site,
        paths: candidate.paths,
        content: candidate.content,
        build: candidate.build,
        assets: candidate.assets,
        og: candidate.og,
        seo: candidate.seo,
        integrations: candidate.integrations,
        i18n: candidate.i18n,
        lint: candidate.lint,
        plugins: candidate.plugins,
    };
    return resolveConfig(input, root, configFile);
}
function assertStablePluginSet(before, after) {
    const beforeNames = before.map(({ name }) => name);
    const afterNames = after.map(({ name }) => name);
    if (stableStringify(beforeNames) !== stableStringify(afterNames)) {
        throw new BuilderError("CONFIG_INVALID", "The config plugin hook cannot add, remove, or reorder plugins.");
    }
}
function pluginFingerprint(plugin) {
    const hooks = [
        "config",
        "buildStart",
        "contentLoaded",
        "transformContent",
        "renderPage",
        "generateBundle",
        "buildEnd",
    ];
    return hashContent(stableStringify({
        name: plugin.name,
        enforce: plugin.enforce,
        hooks: Object.fromEntries(hooks.map((hook) => [
            hook,
            plugin[hook]?.toString(),
        ])),
    }));
}
function normalizedConfigValue(config) {
    return {
        site: config.site,
        paths: config.paths,
        content: {
            ...config.content,
            collections: config.content.collections.map(({ name, directory, schema }) => ({
                name,
                directory,
                schema: schema ? "configured" : undefined,
            })),
        },
        build: config.build,
        assets: config.assets,
        og: config.og,
        seo: config.seo,
        integrations: config.integrations,
        i18n: config.i18n,
        lint: config.lint,
    };
}
async function collectBuildFingerprints(config, mode, entries, assetPlans, ogArtifacts, plugins) {
    const fingerprints = {
        "builder:version": hashContent(BUILDER_VERSION),
        "build:mode": hashContent(mode),
        "config:builder": hashContent(await readFile(config.configFile)),
        "config:normalized": hashContent(stableStringify(normalizedConfigValue(config))),
        "i18n:translations": hashContent(stableStringify(entries.map((entry) => ({
            source: entry.sourceRelativePath,
            route: entry.route.slug,
            locale: entry.frontmatter.locale ?? config.i18n.defaultLocale,
            translationKey: entry.frontmatter.translationKey,
        })).sort((left, right) => compareText(left.source, right.source)))),
    };
    const templateFiles = await discoverFiles(config.resolvedPaths.templates, {
        extensions: [".html"],
        optional: true,
    });
    for (const file of templateFiles) {
        const relative = relativeInsideRoot(config.resolvedPaths.templates, file);
        const withoutExtension = relative.replace(/\.html$/iu, "");
        const id = withoutExtension.startsWith("layouts/")
            ? `template:${withoutExtension.slice("layouts/".length)}`
            : withoutExtension.startsWith("partials/")
                ? `partial:${withoutExtension.slice("partials/".length)}`
                : `template-file:${withoutExtension}`;
        fingerprints[id] = hashContent(await readFile(file));
    }
    for (const file of assetPlans.flatMap(({ files }) => files)) {
        fingerprints[`asset:${file.name}`] = hashContent(file.contents);
    }
    for (const artifact of ogArtifacts) {
        fingerprints[`asset:og:${artifact.route}`] = artifact.contentHash;
    }
    for (const entry of entries) {
        fingerprints[`content:${entry.sourceRelativePath}`] = hashContent(await readFile(entry.sourcePath));
    }
    for (const plugin of plugins) {
        fingerprints[`plugin:${plugin.name}`] = pluginFingerprint(plugin);
    }
    return Object.fromEntries(Object.entries(fingerprints).sort(([left], [right]) => compareText(left, right)));
}
function pluginDiagnosticToSeo(diagnostic, warningsAsErrors) {
    return {
        ruleId: `plugin/${diagnostic.plugin}`,
        severity: diagnostic.severity === "warning" && warningsAsErrors
            ? "error"
            : diagnostic.severity,
        message: diagnostic.message,
        source: diagnostic.source,
    };
}
function requireAsset(manifest, name, kind, source) {
    const asset = manifest[name];
    if (!asset) {
        throw new BuilderError("BUILD_FAILED", `${source} references unknown ${kind} entry '${name}'.`);
    }
    return asset;
}
function renderAssetTags(entry, styleManifest, scriptManifest) {
    const styleNames = entry.assetReferences.styles.length > 0
        ? [...entry.assetReferences.styles]
        : Object.keys(styleManifest).sort();
    const scriptNames = [...entry.assetReferences.scripts];
    const styles = styleNames
        .map((name) => `<link rel="stylesheet" href="${requireAsset(styleManifest, name, "style", entry.sourcePath)}">`)
        .join("\n");
    const scripts = scriptNames
        .map((name) => `<script type="module" src="${requireAsset(scriptManifest, name, "script", entry.sourcePath)}"></script>`)
        .join("\n");
    return { styles, scripts };
}
function schemasForPage(config, entry, metadata) {
    const fm = entry.frontmatter;
    const nodes = [
        createWebSiteSchema({
            name: config.site.name,
            url: config.site.url,
            description: config.seo.feed.description,
            inLanguage: fm.locale ?? config.site.defaultLocale,
        }),
    ];
    if (config.site.organization) {
        nodes.push(createOrganizationSchema({
            name: config.site.organization.name,
            url: config.site.organization.url ?? config.site.url,
            id: serializePublicUrl(new URL("#organization", config.site.url)),
            logo: config.site.organization.logo
                ? resolveSiteAssetUrl(config.site.url, config.site.organization.logo)
                : undefined,
        }));
    }
    const base = {
        name: fm.title,
        description: fm.description,
        url: metadata.canonical,
        inLanguage: fm.locale ?? config.site.defaultLocale,
    };
    if (fm.schemaType === "Article") {
        nodes.push(createArticleSchema({
            ...base,
            datePublished: fm.date,
            dateModified: fm.updated,
            image: metadata.openGraph.image,
            publisher: config.site.organization
                ? {
                    name: config.site.organization.name,
                    url: config.site.organization.url ?? config.site.url,
                    id: serializePublicUrl(new URL("#organization", config.site.url)),
                }
                : undefined,
        }));
    }
    else if (fm.schemaType === "WebApplication") {
        nodes.push(createWebPageSchema(base));
        nodes.push(createWebApplicationSchema({
            ...base,
            applicationCategory: "UtilitiesApplication",
            operatingSystem: "Any",
        }));
    }
    else {
        nodes.push(createWebPageSchema(base));
    }
    if (fm.breadcrumbs !== undefined) {
        const breadcrumbItems = fm.breadcrumbs.map((item) => ({
            name: item.name,
            url: item.url.startsWith("/")
                ? resolveSiteUrl(config.site.url, item.url)
                : serializePublicUrl(new URL(item.url, config.site.url)),
        }));
        if (breadcrumbItems.at(-1)?.url !== metadata.canonical) {
            breadcrumbItems.push({ name: fm.title, url: metadata.canonical });
        }
        nodes.push(createBreadcrumbListSchema(breadcrumbItems));
    }
    if (fm.faq !== undefined) {
        if (!Array.isArray(fm.faq) || fm.faq.length === 0) {
            throw new BuilderError("BUILD_FAILED", `${entry.sourcePath}: faq must be a non-empty array.`);
        }
        const faqItems = fm.faq.map((item, index) => {
            if (!item ||
                typeof item !== "object" ||
                typeof item.question !== "string" ||
                typeof item.answer !== "string") {
                throw new BuilderError("BUILD_FAILED", `${entry.sourcePath}: faq item ${index + 1} requires question and answer strings.`);
            }
            return {
                question: item.question,
                answer: item.answer,
            };
        });
        nodes.push(createFaqPageSchema(faqItems));
    }
    return createJsonLdGraph(nodes);
}
function metadataHeadParts(metadata) {
    const lines = renderMetadataTags(metadata).split("\n");
    return {
        full: lines.join("\n"),
        legacyExtra: lines.slice(3).join("\n"),
    };
}
function metadataForEntry(config, entry, generatedImage) {
    const fm = entry.frontmatter;
    return buildMetadata({
        siteUrl: config.site.url,
        route: entry.route.slug,
        canonical: fm.canonical,
        title: fm.title,
        description: fm.description,
        image: fm.image ?? generatedImage,
        noindex: fm.noindex,
        openGraphType: fm.schemaType === "Article" ? "article" : "website",
    });
}
async function renderPage(context, entry, alternatives, loader, stageRoot, styleManifest, scriptManifest, generatedImage) {
    const { config } = context;
    const fm = entry.frontmatter;
    const metadata = metadataForEntry(config, entry, generatedImage);
    const assets = renderAssetTags(entry, styleManifest, scriptManifest);
    const metadataParts = metadataHeadParts(metadata);
    const jsonLd = config.seo.jsonLd
        ? renderJsonLd(schemasForPage(config, entry, metadata))
        : "";
    const hreflang = renderHreflangTags(alternatives);
    const integrationHead = context.mode === "production"
        ? renderIntegrationHead(config.integrations)
        : "";
    const appendedHead = [assets.styles, assets.scripts, jsonLd, integrationHead]
        .filter(Boolean)
        .join("\n");
    const head = [metadataParts.full, hreflang, appendedHead].filter(Boolean).join("\n");
    const headExtra = [metadataParts.legacyExtra, hreflang, appendedHead].filter(Boolean).join("\n");
    const rendered = await loader.renderLayout(fm.layout ?? "default", {
        ...fm,
        title: fm.title,
        description: fm.description,
        canonical: metadata.canonical,
        lang: fm.locale ?? config.site.defaultLocale,
        site: config.site,
        siteName: config.site.name,
        siteBasePath: siteBasePath(config.site.url),
        content: entry.renderedBody,
        head,
        headExtra,
        styles: assets.styles,
        scripts: assets.scripts,
        jsonLd,
        hreflang,
    });
    const basePathHtml = applySiteBasePath(rendered.html, config.site.url);
    const processedHtml = config.build.minifyHtml
        ? minifyHtmlDocument(basePathHtml)
        : basePathHtml;
    const html = `${processedHtml.trimEnd()}\n`;
    const outputPath = outputPathForSlug(stageRoot, entry.route.slug, config.build.trailingSlash);
    assertInsideRoot(stageRoot, outputPath);
    const dependencies = [...new Set([
            ...entry.dependencyIds,
            ...rendered.dependencies,
            ...Object.keys(styleManifest).map((name) => `asset:${name}`),
            ...entry.assetReferences.scripts.map((name) => `asset:${name}`),
            ...(generatedImage === undefined ? [] : [`asset:og:${entry.route.slug}`]),
        ])].sort();
    return {
        entry,
        metadata,
        page: {
            source: entry.sourcePath,
            route: entry.route.slug,
            canonical: metadata.canonical,
            html,
            outputPath,
            dependencies,
        },
    };
}
async function reusePublishedPage(config, entry, stageRoot, previousCache, generatedImage) {
    const outputId = `output:${entry.route.slug}`;
    const dependencies = previousCache.graph.dependencies[outputId];
    if (dependencies === undefined)
        return null;
    const relativePath = relativeInsideRoot(stageRoot, entry.route.outputPath);
    const expectedFingerprint = previousCache.outputFingerprints[relativePath];
    if (expectedFingerprint === undefined)
        return null;
    const publishedPath = assertInsideRoot(config.resolvedPaths.output, path.join(config.resolvedPaths.output, ...relativePath.split("/")));
    try {
        await assertNoSymlinkPath(config.root, publishedPath);
        const htmlBytes = await readFile(publishedPath);
        if (hashContent(htmlBytes) !== expectedFingerprint)
            return null;
        return {
            entry,
            metadata: metadataForEntry(config, entry, generatedImage),
            page: {
                source: entry.sourcePath,
                route: entry.route.slug,
                canonical: entry.canonical,
                html: htmlBytes.toString("utf8"),
                outputPath: entry.route.outputPath,
                dependencies: dependencies.filter((dependency) => dependency !== "builder:version"
                    && dependency !== "build:mode"
                    && dependency !== "config:builder"
                    && dependency !== "config:normalized"
                    && dependency !== "i18n:translations"
                    && !dependency.startsWith("plugin:")),
            },
        };
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw error;
    }
}
async function recordGraph(rendered, graph, fingerprints, plugins) {
    for (const [node, fingerprint] of Object.entries(fingerprints)) {
        graph.setFingerprint(node, fingerprint);
    }
    const outputs = {};
    for (const { entry, page } of rendered) {
        const contentId = `content:${entry.sourceRelativePath}`;
        const outputId = `output:${entry.route.slug}`;
        for (const dependency of page.dependencies)
            graph.addDependency(outputId, dependency);
        graph.addDependency(outputId, "builder:version");
        graph.addDependency(outputId, "build:mode");
        graph.addDependency(outputId, "config:builder");
        graph.addDependency(outputId, "config:normalized");
        graph.addDependency(outputId, "i18n:translations");
        for (const plugin of plugins)
            graph.addDependency(outputId, `plugin:${plugin.name}`);
        outputs[contentId] = [entry.route.slug];
    }
    return Object.fromEntries(Object.entries(outputs).sort(([a], [b]) => compareText(a, b)));
}
function planGlobalArtifacts(config, entries, mode) {
    const artifacts = [];
    if (config.seo.sitemap) {
        artifacts.push(...planLocalizedSitemaps(entries.map((entry) => ({
            route: entry.route.slug,
            locale: entry.frontmatter.locale ?? config.i18n.defaultLocale,
            canonical: entry.frontmatter.canonical,
            updated: entry.frontmatter.updated,
            draft: entry.frontmatter.draft,
            noindex: entry.frontmatter.noindex,
            sitemap: entry.frontmatter.sitemap,
        })), {
            siteUrl: config.site.url,
            locales: config.i18n.locales,
        }).map((artifact) => ({
            relativePath: artifact.relativePath,
            owner: artifact.index
                ? "seo:sitemap-index"
                : `seo:sitemap:${artifact.locale ?? "default"}:${artifact.relativePath}`,
            contents: artifact.contents,
        })));
    }
    if (config.seo.rss) {
        artifacts.push({
            relativePath: "rss.xml",
            owner: "seo:rss",
            contents: generateRss(entries.map((entry) => ({
                route: entry.route.slug,
                canonical: entry.frontmatter.canonical,
                title: entry.frontmatter.title,
                description: entry.frontmatter.description,
                date: entry.frontmatter.date,
                updated: entry.frontmatter.updated,
                author: typeof entry.frontmatter.author === "string"
                    ? entry.frontmatter.author
                    : undefined,
                draft: entry.frontmatter.draft,
                noindex: entry.frontmatter.noindex,
            })), {
                siteUrl: config.site.url,
                title: config.seo.feed.title ?? config.site.name,
                description: config.seo.feed.description ?? config.site.name,
                language: config.site.language,
            }),
        });
    }
    if (config.seo.robots) {
        artifacts.push({
            relativePath: "robots.txt",
            owner: "seo:robots",
            contents: generateRobotsTxt({
                siteUrl: config.site.url,
                rules: config.seo.robotsRules,
                preview: mode === "development",
                comments: mode === "production" && config.integrations.daumSiteVerification
                    ? [daumWebmasterComment(config.integrations.daumSiteVerification)]
                    : [],
                ...(config.seo.sitemap && mode === "production" ? {} : { sitemapUrls: [] }),
            }),
        });
    }
    if (mode === "production" && config.integrations.googleAdSense) {
        artifacts.push({
            relativePath: "ads.txt",
            owner: "integration:google-adsense",
            contents: generateGoogleAdsTxt(config.integrations.googleAdSense),
        });
    }
    return artifacts.sort((left, right) => compareText(left.relativePath, right.relativePath));
}
function ogFilenameStem(entry) {
    const routeStem = entry.route.slug
        .replace(/^\/+|\/+$/gu, "")
        .replace(/[^A-Za-z0-9_-]+/gu, "-");
    return routeStem || "home";
}
async function planPageOgArtifacts(config, entries, useCache) {
    if (!config.og.enabled)
        return [];
    const artifacts = [];
    const loadedTemplates = new Map();
    let loadedAssets;
    const loadOgAssets = () => {
        loadedAssets ??= Promise.all(Object.entries(config.og.assets).map(async ([name, entry]) => {
            const source = await resolveFileInsideRoot(config.resolvedPaths.public, entry, `OG asset '${name}'`);
            const extension = path.extname(source).toLowerCase();
            const mimeTypes = {
                ".svg": "image/svg+xml",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".webp": "image/webp",
            };
            const mimeType = mimeTypes[extension];
            if (mimeType === undefined) {
                throw new BuilderError("BUILD_FAILED", `Unsupported OG asset format '${extension || "(none)"}' for ${entry}.`);
            }
            const contents = await readFile(source);
            if (contents.byteLength > 5 * 1024 * 1024) {
                throw new BuilderError("BUILD_FAILED", `OG asset is larger than 5 MiB: ${entry}.`);
            }
            return [name, `data:${mimeType};base64,${contents.toString("base64")}`];
        })).then(Object.fromEntries);
        return loadedAssets;
    };
    let loadedFonts;
    const loadOgFonts = () => {
        loadedFonts ??= Promise.all(config.og.fonts.map(async (font) => {
            const source = await resolveFileInsideRoot(config.resolvedPaths.templates, font.file, "OG font file");
            const extension = path.extname(source).toLowerCase();
            const formats = {
                ".ttf": { mimeType: "font/ttf", format: "truetype" },
                ".otf": { mimeType: "font/otf", format: "opentype" },
                ".woff": { mimeType: "font/woff", format: "woff" },
                ".woff2": { mimeType: "font/woff2", format: "woff2" },
            };
            const format = formats[extension];
            if (format === undefined) {
                throw new BuilderError("BUILD_FAILED", `Unsupported OG font format '${extension || "(none)"}' for ${font.file}.`);
            }
            return Object.freeze({
                ...format,
                contents: new Uint8Array(await readFile(source)),
                weight: font.weight,
                style: font.style,
            });
        }));
        return loadedFonts;
    };
    const loadOgTemplate = async (entry) => {
        const cached = loadedTemplates.get(entry);
        if (cached !== undefined)
            return cached;
        const template = await readTextFile(config.resolvedPaths.templates, entry);
        loadedTemplates.set(entry, template);
        return template;
    };
    for (const entry of entries) {
        if (entry.frontmatter.image !== undefined)
            continue;
        const requestedTemplate = entry.frontmatter.ogTemplate;
        if (requestedTemplate && config.og.templates[requestedTemplate] === undefined) {
            throw new BuilderError("BUILD_FAILED", `${entry.sourceRelativePath} references unknown OG template '${requestedTemplate}'.`);
        }
        const templateName = requestedTemplate ?? entry.frontmatter.layout;
        const templateEntry = templateName === undefined
            ? config.og.templates.default
            : config.og.templates[templateName] ?? config.og.templates.default;
        if (templateEntry === undefined)
            continue;
        const template = await loadOgTemplate(templateEntry);
        const planned = await planOgImage({
            title: entry.frontmatter.ogTitle ?? entry.frontmatter.title,
            subtitle: entry.frontmatter.ogDescription ?? entry.frontmatter.description,
            category: entry.collection,
            siteName: config.site.name,
        }, {
            width: config.og.width,
            height: config.og.height,
            format: config.og.format,
            quality: config.og.quality,
            fontFamily: config.og.fontFamily,
            titleCharactersPerLine: config.og.titleCharactersPerLine,
            subtitleCharactersPerLine: config.og.subtitleCharactersPerLine,
            subtitleLineCount: config.og.subtitleLineCount,
            fonts: await loadOgFonts(),
            assets: await loadOgAssets(),
            template,
            filenameStem: ogFilenameStem(entry),
            publicPath: "/assets/og",
            cacheDirectory: useCache ? config.resolvedPaths.cache : undefined,
        });
        const relativePath = `assets/og/${planned.filename}`;
        artifacts.push({
            relativePath,
            owner: `og:${entry.sourceRelativePath}`,
            route: entry.route.slug,
            url: new URL(resolveSiteUrl(config.site.url, planned.url)).pathname,
            contents: planned.contents,
            contentHash: planned.contentHash,
        });
    }
    return artifacts.sort((left, right) => compareText(left.relativePath, right.relativePath));
}
async function writeAssetPlans(stageRoot, plans) {
    const files = plans
        .flatMap((plan) => plan.files)
        .sort((left, right) => compareText(left.relativePath, right.relativePath) || compareText(left.name, right.name));
    for (const file of files) {
        const target = assertInsideRoot(stageRoot, path.join(stageRoot, ...file.relativePath.split("/")));
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.contents);
    }
}
async function writeGlobalArtifacts(stageRoot, artifacts) {
    for (const artifact of artifacts) {
        const target = assertInsideRoot(stageRoot, path.join(stageRoot, ...artifact.relativePath.split("/")));
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, artifact.contents, "utf8");
    }
}
async function writePluginArtifacts(stageRoot, artifacts) {
    for (const artifact of artifacts) {
        const target = assertInsideRoot(stageRoot, path.join(stageRoot, ...artifact.relativePath.split("/")));
        await assertNoSymlinkPath(stageRoot, path.dirname(target), true);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, artifact.contents);
    }
}
async function writeOgArtifacts(stageRoot, artifacts) {
    for (const artifact of artifacts) {
        const target = assertInsideRoot(stageRoot, path.join(stageRoot, ...artifact.relativePath.split("/")));
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, artifact.contents);
    }
}
function noOutputSync() {
    return { written: [], unchanged: [], removed: [] };
}
function assertContentEntryIdentity(before, after, hook, stageRoot) {
    if (after.sourcePath !== before.sourcePath ||
        after.sourceRelativePath !== before.sourceRelativePath ||
        after.route.slug !== before.route.slug ||
        after.route.outputPath !== before.route.outputPath ||
        after.route.isExplicitFile !== before.route.isExplicitFile) {
        throw new BuilderError("PLUGIN_FAILED", `${hook} must preserve content source and route identity.`, { details: { hook, source: before.sourceRelativePath } });
    }
    assertInsideRoot(stageRoot, after.route.outputPath);
    if (after.frontmatter.slug !== after.route.slug) {
        throw new BuilderError("PLUGIN_FAILED", `${hook} produced frontmatter.slug that does not match the normalized route.`, { details: { hook, source: before.sourceRelativePath } });
    }
}
function assertRenderedPageIdentity(before, after, stageRoot) {
    if (after.source !== before.source ||
        after.route !== before.route ||
        after.outputPath !== before.outputPath) {
        throw new BuilderError("PLUGIN_FAILED", "renderPage must preserve source, route, and outputPath.", { details: { hook: "renderPage", source: before.source } });
    }
    if (typeof after.html !== "string" ||
        typeof after.canonical !== "string" ||
        !Array.isArray(after.dependencies) ||
        after.dependencies.some((dependency) => typeof dependency !== "string")) {
        throw new BuilderError("PLUGIN_FAILED", "renderPage returned an invalid page value.", { details: { hook: "renderPage", source: before.source } });
    }
    assertInsideRoot(stageRoot, after.outputPath);
}
function assertNoErrorDiagnostics(diagnostics) {
    const errors = diagnostics.filter(({ severity }) => severity === "error");
    if (errors.length > 0) {
        throw new BuilderError("CHECK_FAILED", `SEO/AEO validation failed with ${errors.length} error(s).`, { details: { diagnostics } });
    }
}
async function runBuild(options) {
    const root = path.resolve(options.root ?? process.cwd());
    const loadedConfig = await loadConfig(root, options.configFile);
    validateProjectPaths(loadedConfig);
    const mode = options.mode ?? "production";
    const initialContext = createBuildContext(loadedConfig, {
        logger: options.logger,
        mode,
    });
    const bootstrapRunner = createPluginRunner(loadedConfig.plugins, {
        config: loadedConfig,
        outputRoot: stagePathFor(loadedConfig),
        mode,
        logger: initialContext.logger,
    });
    const configuredCandidate = await bootstrapRunner.applyConfig();
    assertStablePluginSet(loadedConfig.plugins, configuredCandidate.plugins);
    const config = normalizePluginConfig(configuredCandidate, root, loadedConfig.configFile);
    validateProjectPaths(config);
    const context = createBuildContext(config, {
        logger: initialContext.logger,
        mode,
    });
    const stageRoot = stagePathFor(config);
    const shouldWrite = options.write ?? true;
    const graph = new DependencyGraph();
    const pluginDiagnostics = [];
    const pluginArtifacts = [];
    let acceptingPluginArtifacts = true;
    const pluginRunner = createPluginRunner(config.plugins, {
        config,
        outputRoot: stageRoot,
        mode,
        logger: context.logger,
        diagnostics: pluginDiagnostics,
        addDependency: (node, dependency) => graph.addDependency(node, dependency),
        emitFile: async (pluginName, relativePath, contents) => {
            if (!acceptingPluginArtifacts) {
                throw new BuilderError("PLUGIN_FAILED", `Plugin '${pluginName}' emitted a file after bundle finalization.`, { details: { plugin: pluginName, hook: "buildEnd" } });
            }
            const normalized = normalizedOutputPath(relativePath);
            pluginArtifacts.push({
                relativePath: normalized,
                owner: `plugin:${pluginName}:${normalized}`,
                contents: typeof contents === "string" ? contents : new Uint8Array(contents),
            });
        },
    });
    try {
        await assertNoSymlinkPath(root, config.resolvedPaths.output, true);
        await assertNoSymlinkPath(root, config.resolvedPaths.cache, true);
        await assertNoSymlinkPath(root, stageRoot, true);
        await pluginRunner.buildStart();
        const [publicFiles, stylePlan, scriptPlan] = await Promise.all([
            discoverFiles(config.resolvedPaths.public, { optional: true }),
            planCssEntries({
                projectRoot: root,
                outputRoot: stageRoot,
                entries: config.assets.styles,
                hash: config.assets.hash,
                minify: config.assets.minify,
            }),
            planScriptEntries({
                projectRoot: root,
                outputRoot: stageRoot,
                entries: config.assets.scripts,
                hash: config.assets.hash,
                minify: config.assets.minify,
            }),
        ]);
        const styleManifest = manifestUnderSiteBase(stylePlan.manifest, config.site.url);
        const scriptManifest = manifestUnderSiteBase(scriptPlan.manifest, config.site.url);
        const baseAssets = Object.fromEntries(Object.entries({ ...styleManifest, ...scriptManifest })
            .sort(([a], [b]) => compareText(a, b)));
        const loadedEntries = await loadContent({
            contentRoot: config.resolvedPaths.content,
            outputRoot: stageRoot,
            siteUrl: config.site.url,
            production: context.mode === "production",
            trailingSlash: config.build.trailingSlash,
            allowRawHtml: config.content.allowRawHtml,
            mdxComponents: config.content.mdxComponents,
            collections: config.content.collections,
            i18n: config.i18n,
        });
        if (loadedEntries.length === 0) {
            throw new BuilderError("BUILD_FAILED", "No publishable content entries were found.");
        }
        const contentLoadedEntries = [];
        for (const entry of loadedEntries) {
            const transformed = await pluginRunner.contentLoaded(entry);
            assertContentEntryIdentity(entry, transformed, "contentLoaded", stageRoot);
            contentLoadedEntries.push(transformed);
        }
        const entries = [];
        for (const entry of contentLoadedEntries) {
            const transformed = await pluginRunner.transformContent(entry);
            assertContentEntryIdentity(entry, transformed, "transformContent", stageRoot);
            entries.push(transformed);
        }
        try {
            assertUniqueSlugs(entries, (entry) => entry.route.slug, (entry) => entry.sourceRelativePath);
        }
        catch (error) {
            throw new BuilderError("BUILD_FAILED", error instanceof Error ? error.message : "A plugin produced duplicate content routes.", { cause: error });
        }
        const ogArtifacts = await planPageOgArtifacts(config, entries, shouldWrite);
        const ogImageByRoute = new Map(ogArtifacts.map((artifact) => [artifact.route, artifact.url]));
        const assets = Object.freeze(Object.fromEntries(Object.entries({
            ...baseAssets,
            ...Object.fromEntries(ogArtifacts.map((artifact) => [
                `og:${artifact.route}`,
                artifact.url,
            ])),
        }).sort(([left], [right]) => compareText(left, right))));
        const content = createContentRepository(entries);
        let translationAlternates;
        try {
            translationAlternates = createTranslationAlternates(entries.map((entry) => ({
                route: entry.route.slug,
                locale: entry.frontmatter.locale ?? config.i18n.defaultLocale,
                translationKey: entry.frontmatter.translationKey,
            })), config.site.url, config.i18n);
        }
        catch (error) {
            throw new BuilderError("BUILD_FAILED", error instanceof Error ? error.message : "Unable to link translated content.", { cause: error });
        }
        const currentFingerprints = await collectBuildFingerprints(config, context.mode, entries, [stylePlan, scriptPlan], ogArtifacts, pluginRunner.plugins);
        const previousCache = shouldWrite
            ? await loadBuildCache(config.resolvedPaths.cache)
            : null;
        const invalidation = planInvalidation(previousCache?.graph ?? null, currentFingerprints);
        const mayReusePublishedPages = shouldWrite
            && previousCache !== null
            && pluginRunner.plugins.length === 0;
        const templateLoader = new FileTemplateLoader({ root: config.resolvedPaths.templates });
        const rendered = [];
        let renderedPageCount = 0;
        let reusedPageCount = 0;
        for (const entry of entries) {
            const outputId = `output:${entry.route.slug}`;
            const reused = mayReusePublishedPages
                && previousCache !== null
                && !invalidation.affectedOutputs.has(outputId)
                ? await reusePublishedPage(config, entry, stageRoot, previousCache, ogImageByRoute.get(entry.route.slug))
                : null;
            if (reused !== null) {
                rendered.push(reused);
                reusedPageCount += 1;
                continue;
            }
            const renderedPage = await renderPage(context, entry, translationAlternates.get(entry.route.slug) ?? [], templateLoader, stageRoot, styleManifest, scriptManifest, ogImageByRoute.get(entry.route.slug));
            const pluginPage = await pluginRunner.renderPage(renderedPage.page);
            assertRenderedPageIdentity(renderedPage.page, pluginPage, stageRoot);
            rendered.push({ ...renderedPage, page: pluginPage });
            renderedPageCount += 1;
        }
        const globalArtifacts = planGlobalArtifacts(config, entries, context.mode);
        await pluginRunner.generateBundle({
            pages: Object.freeze(rendered.map(({ page }) => Object.freeze({
                ...page,
                dependencies: Object.freeze([...page.dependencies]),
            }))),
            assets: Object.freeze({ ...assets }),
            outputRoot: stageRoot,
            emitFile: async () => {
                throw new BuilderError("PLUGIN_FAILED", "Bundle emission requires a plugin-scoped generateBundle hook.");
            },
        });
        const createOutputClaims = () => [
            ...publicFiles.map((file) => {
                const relativePath = relativeInsideRoot(config.resolvedPaths.public, file);
                return { relativePath, owner: `public:${relativePath}` };
            }),
            ...stylePlan.files.map((file) => ({
                relativePath: file.relativePath,
                owner: `asset:style:${file.name}`,
            })),
            ...scriptPlan.files.map((file) => ({
                relativePath: file.relativePath,
                owner: `asset:script:${file.name}`,
            })),
            ...ogArtifacts,
            { relativePath: "assets/manifest.json", owner: "asset:manifest" },
            ...rendered.map(({ entry, page }) => ({
                relativePath: relativeInsideRoot(stageRoot, page.outputPath),
                owner: `page:${entry.sourceRelativePath}`,
            })),
            ...globalArtifacts,
            ...pluginArtifacts,
        ];
        const diagnose = (claims) => {
            const pageRoutes = new Map(rendered.map(({ entry, page }) => [
                normalizedOutputPath(relativeInsideRoot(stageRoot, page.outputPath)),
                entry.route.slug,
            ]));
            const knownPaths = [...new Set(claims.map(({ relativePath }) => pageRoutes.get(normalizedOutputPath(relativePath)) ?? routeForOutputPath(relativePath)))]
                .sort(compareText);
            return diagnoseSeoSite(rendered.map(({ entry, page }) => ({
                route: page.route,
                source: entry.sourceRelativePath,
                html: page.html,
                canonical: entry.frontmatter.canonical,
                locale: entry.frontmatter.locale,
                updated: entry.frontmatter.updated,
                draft: entry.frontmatter.draft,
                noindex: entry.frontmatter.noindex,
            })), {
                siteUrl: config.site.url,
                locales: config.site.locales,
                entryRoutes: config.i18n.locales.map((locale) => localizeRoute("/", locale, config.i18n)),
                knownPaths,
                descriptionLength: config.seo.descriptionLength,
                forbiddenElements: config.lint.forbiddenElements,
                forbiddenClasses: config.lint.forbiddenClasses,
                warningAsError: config.lint.warningsAsErrors,
            });
        };
        let outputClaims = createOutputClaims();
        assertUniqueOutputOwnership(outputClaims);
        const diagnostics = [
            ...diagnose(outputClaims),
            ...pluginDiagnostics.map((diagnostic) => pluginDiagnosticToSeo(diagnostic, config.lint.warningsAsErrors)),
        ];
        assertNoErrorDiagnostics(diagnostics);
        const resultPages = rendered.map(({ page }) => Object.freeze({
            ...page,
            dependencies: Object.freeze([...page.dependencies]),
            outputPath: path.join(config.resolvedPaths.output, ...relativeInsideRoot(stageRoot, page.outputPath).split("/")),
        }));
        const incremental = {
            renderedPages: renderedPageCount,
            reusedPages: reusedPageCount,
            invalidatedOutputs: (previousCache === null
                ? rendered.map(({ page }) => `output:${page.route}`)
                : [...invalidation.affectedOutputs])
                .sort(compareText),
            writtenFiles: [],
            unchangedFiles: [],
            removedFiles: [],
        };
        const provisionalResult = {
            root,
            outputRoot: config.resolvedPaths.output,
            pages: Object.freeze(resultPages),
            content,
            assets,
            diagnostics,
            incremental,
            written: shouldWrite,
        };
        await pluginRunner.buildEnd(provisionalResult);
        acceptingPluginArtifacts = false;
        outputClaims = createOutputClaims();
        assertUniqueOutputOwnership(outputClaims);
        diagnostics.splice(0, diagnostics.length, ...diagnose(outputClaims), ...pluginDiagnostics.map((diagnostic) => pluginDiagnosticToSeo(diagnostic, config.lint.warningsAsErrors)));
        assertNoErrorDiagnostics(diagnostics);
        for (const diagnostic of diagnostics) {
            context.logger.warn(`${diagnostic.ruleId}: ${diagnostic.source ?? diagnostic.route ?? "site"}: ${diagnostic.message}`);
        }
        const outputs = await recordGraph(rendered, graph, currentFingerprints, pluginRunner.plugins);
        const serializedGraph = graph.serialize();
        let outputSync = noOutputSync();
        if (shouldWrite) {
            await assertNoSymlinkPath(root, stageRoot, true);
            await rm(stageRoot, { recursive: true, force: true });
            await mkdir(stageRoot, { recursive: true });
            await copyDirectory(config.resolvedPaths.public, stageRoot);
            await writeAssetPlans(stageRoot, [stylePlan, scriptPlan]);
            await writeOgArtifacts(stageRoot, ogArtifacts);
            await writeAssetManifest(stageRoot, assets);
            for (const { page } of rendered) {
                await mkdir(path.dirname(page.outputPath), { recursive: true });
                await writeFile(page.outputPath, page.html, "utf8");
            }
            await writeGlobalArtifacts(stageRoot, globalArtifacts);
            await writePluginArtifacts(stageRoot, pluginArtifacts);
            await assertNoSymlinkPath(root, config.resolvedPaths.output, true);
            outputSync = await syncOutputTree(stageRoot, config.resolvedPaths.output, {
                removeStale: config.build.clean,
            });
            await assertNoSymlinkPath(root, stageRoot);
            await rm(stageRoot, { recursive: true, force: true });
            const outputFingerprints = Object.fromEntries(rendered.map(({ page }) => [
                relativeInsideRoot(stageRoot, page.outputPath),
                hashContent(page.html),
            ]).sort(([left], [right]) => compareText(left, right)));
            try {
                await assertNoSymlinkPath(root, config.resolvedPaths.cache, true);
                await saveBuildCache(config.resolvedPaths.cache, {
                    version: CACHE_VERSION,
                    builderVersion: BUILDER_VERSION,
                    graph: serializedGraph,
                    outputs,
                    outputFingerprints,
                });
            }
            catch (error) {
                context.logger.warn(`Build output was published, but the incremental cache could not be saved: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        incremental.writtenFiles = [...outputSync.written];
        incremental.unchangedFiles = [...outputSync.unchanged];
        incremental.removedFiles = [...outputSync.removed];
        return {
            ...provisionalResult,
            incremental,
        };
    }
    catch (error) {
        try {
            await assertNoSymlinkPath(root, stageRoot, true);
            await rm(stageRoot, { recursive: true, force: true });
        }
        catch {
            // Never follow or delete a staging path that was replaced by a link.
        }
        throw error;
    }
}
export async function build(options = {}) {
    return runBuild({ ...options, write: options.write ?? true });
}
export async function check(options = {}) {
    return runBuild({ ...options, write: false });
}
export async function clean(options = {}) {
    const root = path.resolve(options.root ?? process.cwd());
    const config = await loadConfig(root, options.configFile);
    validateProjectPaths(config);
    const removed = [config.resolvedPaths.output, config.resolvedPaths.cache];
    for (const target of removed) {
        await assertNoSymlinkPath(root, target, true);
        await rm(target, { recursive: true, force: true });
    }
    return { root, removed };
}
//# sourceMappingURL=builder.js.map