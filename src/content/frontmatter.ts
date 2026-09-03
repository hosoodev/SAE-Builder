import matter from "gray-matter";
import { z } from "zod";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

const isoDateSchema = z.string().refine(isCalendarDate, {
  message: "Expected a valid date in YYYY-MM-DD format",
});

const nonEmptyString = z.string().trim().min(1);

export const coreFrontMatterSchema = z.object({
  title: nonEmptyString,
  description: nonEmptyString,
  slug: z.string().min(1),
  layout: nonEmptyString.optional(),
  locale: nonEmptyString.optional(),
  translationKey: nonEmptyString.optional(),
  date: isoDateSchema.optional(),
  updated: isoDateSchema.optional(),
  draft: z.boolean().optional(),
  noindex: z.boolean().optional(),
  canonical: nonEmptyString.optional(),
  image: nonEmptyString.optional(),
  ogTemplate: nonEmptyString.optional(),
  ogTitle: nonEmptyString.optional(),
  ogDescription: nonEmptyString.optional(),
  schemaType: z.enum(["WebPage", "Article", "WebApplication"]).optional(),
  collection: nonEmptyString.optional(),
  tags: z.array(nonEmptyString).optional(),
  scripts: z.array(nonEmptyString).optional(),
  styles: z.array(nonEmptyString).optional(),
  breadcrumbs: z.array(z.object({
    name: nonEmptyString,
    url: nonEmptyString,
  }).strict()).min(1).optional(),
  sitemap: z.object({
    priority: z.number().min(0).max(1).optional(),
    changefreq: z.enum([
      "always",
      "hourly",
      "daily",
      "weekly",
      "monthly",
      "yearly",
      "never",
    ]).optional(),
  }).strict().optional(),
}).passthrough();

export type CoreFrontMatter = z.infer<typeof coreFrontMatterSchema>;

export interface ParsedFrontMatterDocument {
  frontmatter: CoreFrontMatter;
  body: string;
}

export class FrontMatterError extends Error {
  readonly sourcePath?: string;
  readonly issues: readonly z.ZodIssue[];

  constructor(sourcePath: string | undefined, issues: readonly z.ZodIssue[]) {
    const location = sourcePath === undefined ? "content" : sourcePath;
    const detail = issues
      .map((issue) => `${issue.path.join(".") || "frontmatter"}: ${issue.message}`)
      .join("; ");
    super(`Invalid front matter in ${location}: ${detail}`);
    this.name = "FrontMatterError";
    this.sourcePath = sourcePath;
    this.issues = issues;
  }
}

export function validateFrontMatter(
  value: unknown,
  sourcePath?: string,
): CoreFrontMatter {
  const result = coreFrontMatterSchema.safeParse(value);
  if (!result.success) throw new FrontMatterError(sourcePath, result.error.issues);
  return result.data;
}

export function parseFrontMatter(
  source: string,
  sourcePath?: string,
): ParsedFrontMatterDocument {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(source);
  } catch (error) {
    const location = sourcePath === undefined ? "content" : sourcePath;
    throw new Error(
      `Unable to parse front matter in ${location}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  return {
    frontmatter: validateFrontMatter(parsed.data, sourcePath),
    body: parsed.content,
  };
}
