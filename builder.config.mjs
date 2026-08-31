import examplePlugin from "./plugins/example-plugin.mjs";

export default {
  site: {
    name: "SEO/AEO Static Builder Demo",
    url: "https://example.com",
    language: "ko-KR",
    defaultLocale: "ko",
    locales: ["ko"],
  },
  paths: {
    content: "content",
    templates: "templates",
    public: "public",
    output: "demo-dist",
    cache: ".demo-builder-cache",
  },
  content: {
    collections: ["guides"],
    allowRawHtml: false,
    mdxComponents: {},
  },
  build: {
    clean: true,
    minifyHtml: false,
  },
  assets: {
    hash: true,
    minify: true,
    styles: { styles: "src/styles.css" },
    scripts: { demo: "src/main.ts" },
    images: {
      formats: ["webp", "avif"],
      widths: [480, 768, 1200],
      quality: 82,
    },
  },
  seo: {
    sitemap: true,
    robots: true,
    rss: true,
    jsonLd: true,
    feed: {
      description: "SAE Builder의 HTML-first 데모 사이트",
    },
  },
  lint: {
    forbiddenElements: [],
    forbiddenClasses: [],
    warningsAsErrors: false,
  },
  plugins: [examplePlugin],
};
