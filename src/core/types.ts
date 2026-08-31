import type { BuilderPlugin } from "../plugin/index.js";
import type {
  CollectionConfig,
  ContentCollectionDefinition,
} from "../content/collection.js";

export interface SiteConfig {
  name: string;
  url: string;
  language: string;
  defaultLocale: string;
  locales: string[];
  organization?: {
    name: string;
    url?: string;
    logo?: string;
  };
}

export interface ProjectPaths {
  content: string;
  templates: string;
  public: string;
  output: string;
  cache: string;
}

export interface ContentConfig {
  collections: ContentCollectionDefinition[];
  allowRawHtml: boolean;
  mdxComponents: Record<string, {
    tagName: string;
    allowedAttributes?: string[];
    fixedAttributes?: Record<string, string | number | boolean>;
  }>;
}

export interface BuildConfig {
  clean: boolean;
  minifyHtml: boolean;
  trailingSlash: boolean;
}

export interface AssetConfig {
  hash: boolean;
  minify: boolean;
  styles: Record<string, string>;
  scripts: Record<string, string>;
  images: {
    formats: Array<"webp" | "avif">;
    widths: number[];
    quality: number;
  };
}

export interface SeoConfig {
  sitemap: boolean;
  rss: boolean;
  robots: boolean;
  jsonLd: boolean;
  feed: {
    title?: string;
    description?: string;
  };
  robotsRules: Array<{
    userAgent: string;
    allow?: string[];
    disallow?: string[];
  }>;
}

export interface IntegrationConfig {
  naverAnalytics?: string;
  naverSiteVerification?: string;
  daumSiteVerification?: string;
  googleAnalytics?: string;
  googleAdSense?: string;
}

export interface OgConfig {
  enabled: boolean;
  width: number;
  height: number;
  format: "png" | "webp";
  quality: number;
  fontFamily?: string;
  templates: Record<string, string>;
}

export interface LintConfig {
  forbiddenElements: string[];
  forbiddenClasses: string[];
  warningsAsErrors: boolean;
}

export interface I18nConfig {
  defaultLocale: string;
  locales: string[];
  routing: "prefix-all" | "prefix-except-default";
}

export interface BuilderConfig {
  site: SiteConfig;
  paths: ProjectPaths;
  content: ContentConfig;
  build: BuildConfig;
  assets: AssetConfig;
  og: OgConfig;
  seo: SeoConfig;
  integrations: IntegrationConfig;
  i18n: I18nConfig;
  lint: LintConfig;
  plugins: BuilderPlugin[];
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<U>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

type UserContentConfig = Omit<DeepPartial<ContentConfig>, "collections"> & {
  collections?: CollectionConfig[];
};

export type UserConfig = Omit<DeepPartial<BuilderConfig>, "site" | "content"> & {
  site: Pick<SiteConfig, "name" | "url"> & Partial<SiteConfig>;
  content?: UserContentConfig;
};

export interface ResolvedPaths {
  content: string;
  templates: string;
  public: string;
  output: string;
  cache: string;
}

export interface ResolvedBuilderConfig extends BuilderConfig {
  root: string;
  configFile: string;
  resolvedPaths: ResolvedPaths;
}
