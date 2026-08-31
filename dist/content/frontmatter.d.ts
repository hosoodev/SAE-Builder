import { z } from "zod";
export declare const coreFrontMatterSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodString;
    slug: z.ZodString;
    layout: z.ZodOptional<z.ZodString>;
    locale: z.ZodOptional<z.ZodString>;
    translationKey: z.ZodOptional<z.ZodString>;
    date: z.ZodOptional<z.ZodString>;
    updated: z.ZodOptional<z.ZodString>;
    draft: z.ZodOptional<z.ZodBoolean>;
    noindex: z.ZodOptional<z.ZodBoolean>;
    canonical: z.ZodOptional<z.ZodString>;
    image: z.ZodOptional<z.ZodString>;
    ogTemplate: z.ZodOptional<z.ZodString>;
    schemaType: z.ZodOptional<z.ZodEnum<{
        WebPage: "WebPage";
        Article: "Article";
        WebApplication: "WebApplication";
    }>>;
    collection: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    scripts: z.ZodOptional<z.ZodArray<z.ZodString>>;
    styles: z.ZodOptional<z.ZodArray<z.ZodString>>;
    breadcrumbs: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        url: z.ZodString;
    }, z.core.$strict>>>;
    sitemap: z.ZodOptional<z.ZodObject<{
        priority: z.ZodOptional<z.ZodNumber>;
        changefreq: z.ZodOptional<z.ZodEnum<{
            always: "always";
            hourly: "hourly";
            daily: "daily";
            weekly: "weekly";
            monthly: "monthly";
            yearly: "yearly";
            never: "never";
        }>>;
    }, z.core.$strict>>;
}, z.core.$loose>;
export type CoreFrontMatter = z.infer<typeof coreFrontMatterSchema>;
export interface ParsedFrontMatterDocument {
    frontmatter: CoreFrontMatter;
    body: string;
}
export declare class FrontMatterError extends Error {
    readonly sourcePath?: string;
    readonly issues: readonly z.ZodIssue[];
    constructor(sourcePath: string | undefined, issues: readonly z.ZodIssue[]);
}
export declare function validateFrontMatter(value: unknown, sourcePath?: string): CoreFrontMatter;
export declare function parseFrontMatter(source: string, sourcePath?: string): ParsedFrontMatterDocument;
//# sourceMappingURL=frontmatter.d.ts.map