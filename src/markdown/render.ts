import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

type AttributeValue = string | number | boolean;

interface MutableNode {
  type: string;
  name?: string | null;
  tagName?: string;
  value?: unknown;
  properties?: Record<string, unknown>;
  attributes?: MutableAttribute[];
  children?: MutableNode[];
  position?: {
    start?: { line?: number; column?: number };
  };
}

interface MutableAttribute {
  type: string;
  name?: string | { name?: string };
  value?: unknown;
}

export interface StaticMdxComponent {
  /** Semantic HTML element emitted for this build-time component. */
  tagName: string;
  /** Literal content attributes accepted from MDX authors. */
  allowedAttributes?: readonly string[];
  /** Trusted, project-owned attributes always included on the element. */
  fixedAttributes?: Readonly<Record<string, AttributeValue>>;
}

export interface MarkdownRenderOptions {
  format?: "markdown" | "mdx";
  allowRawHtml?: boolean;
  components?: Readonly<Record<string, StaticMdxComponent>>;
  sourcePath?: string;
}

export interface MarkdownRenderResult {
  html: string;
}

export class MarkdownError extends Error {
  readonly sourcePath?: string;

  constructor(message: string, sourcePath?: string) {
    super(sourcePath === undefined ? message : `${sourcePath}: ${message}`);
    this.name = "MarkdownError";
    this.sourcePath = sourcePath;
  }
}

const HTML_NAME = /^[A-Za-z][A-Za-z0-9:._-]*$/;
const SAFE_TAG_NAME = /^[a-z][a-z0-9-]*$/;
const FORBIDDEN_COMPONENT_TAGS = new Set([
  "base",
  "embed",
  "iframe",
  "link",
  "meta",
  "object",
  "script",
  "style",
]);
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);
const URL_ATTRIBUTES = new Set(["action", "cite", "formaction", "href", "poster", "src"]);

function locationFor(node: MutableNode): string {
  const line = node.position?.start?.line;
  const column = node.position?.start?.column;
  return line === undefined ? "" : ` at ${line}:${column ?? 1}`;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function outputAttributeName(name: string): string {
  if (name === "className") return "class";
  if (name === "htmlFor") return "for";
  return name;
}

function assertSafeAttributeName(name: string, componentName: string): void {
  if (!HTML_NAME.test(name)) {
    throw new MarkdownError(`Invalid attribute ${JSON.stringify(name)} on <${componentName}>`);
  }
  if (/^on/i.test(name) || name.toLowerCase() === "style" || name.toLowerCase() === "srcdoc") {
    throw new MarkdownError(`Unsafe attribute ${JSON.stringify(name)} on <${componentName}>`);
  }
}

function assertSafeAuthoredAttributeValue(name: string, value: string | true, componentName: string): void {
  if (value === true || !URL_ATTRIBUTES.has(outputAttributeName(name).toLowerCase())) return;
  if (/^\s*(?:javascript|vbscript|data):/i.test(value)) {
    throw new MarkdownError(`Unsafe URL in attribute ${JSON.stringify(name)} on <${componentName}>`);
  }
}

function literalAttributes(node: MutableNode): Map<string, string | true> {
  const result = new Map<string, string | true>();

  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== "mdxJsxAttribute" || typeof attribute.name !== "string") {
      throw new MarkdownError(
        `MDX spread, namespaced, and expression attributes are not allowed${locationFor(node)}`,
      );
    }
    if (attribute.value !== null && attribute.value !== undefined && typeof attribute.value !== "string") {
      throw new MarkdownError(
        `MDX attribute expressions are not allowed${locationFor(node)}`,
      );
    }
    if (result.has(attribute.name)) {
      throw new MarkdownError(
        `Duplicate MDX attribute ${JSON.stringify(attribute.name)}${locationFor(node)}`,
      );
    }
    result.set(attribute.name, typeof attribute.value === "string" ? attribute.value : true);
  }

  return result;
}

function serializeAttributes(
  attributes: ReadonlyMap<string, AttributeValue>,
  escape: boolean,
): string {
  let output = "";
  for (const [inputName, value] of attributes) {
    const name = outputAttributeName(inputName);
    if (value === false) continue;
    if (value === true) {
      output += ` ${name}`;
      continue;
    }
    const stringValue = String(value);
    output += ` ${name}="${escape ? escapeAttribute(stringValue) : stringValue}"`;
  }
  return output;
}

function wrapperNodes(
  node: MutableNode,
  tagName: string,
  attributes: ReadonlyMap<string, AttributeValue>,
  wrapperType: "html" | "text",
): MutableNode[] {
  const open = `<${tagName}${serializeAttributes(attributes, wrapperType === "html")}>`;
  if (VOID_TAGS.has(tagName)) {
    if ((node.children?.length ?? 0) > 0) {
      throw new MarkdownError(`Void element <${tagName}> cannot have children${locationFor(node)}`);
    }
    return [{ type: wrapperType, value: open }];
  }

  return [
    { type: wrapperType, value: open },
    ...(node.children ?? []),
    { type: wrapperType, value: `</${tagName}>` },
  ];
}

function transformMdxChildren(
  parent: MutableNode,
  options: Required<Pick<MarkdownRenderOptions, "allowRawHtml">>
    & Pick<MarkdownRenderOptions, "components">,
): void {
  if (parent.children === undefined) return;
  const transformed: MutableNode[] = [];

  for (const child of parent.children) {
    if (child.type === "mdxjsEsm") {
      throw new MarkdownError(`MDX imports and exports are not allowed${locationFor(child)}`);
    }
    if (child.type === "mdxFlowExpression" || child.type === "mdxTextExpression") {
      throw new MarkdownError(`MDX expressions are not allowed${locationFor(child)}`);
    }

    const isMdxElement = child.type === "mdxJsxFlowElement" || child.type === "mdxJsxTextElement";
    if (!isMdxElement) {
      transformMdxChildren(child, options);
      transformed.push(child);
      continue;
    }

    if (typeof child.name !== "string" || child.name.length === 0) {
      throw new MarkdownError(`MDX fragments are not allowed${locationFor(child)}`);
    }

    const authoredAttributes = literalAttributes(child);
    transformMdxChildren(child, options);
    const component = options.components?.[child.name];

    if (component !== undefined) {
      if (!SAFE_TAG_NAME.test(component.tagName) || FORBIDDEN_COMPONENT_TAGS.has(component.tagName)) {
        throw new MarkdownError(
          `Component <${child.name}> has unsafe output tag ${JSON.stringify(component.tagName)}`,
        );
      }

      const allowed = new Set(component.allowedAttributes ?? []);
      const outputAttributes = new Map<string, AttributeValue>();
      for (const [name, value] of Object.entries(component.fixedAttributes ?? {})) {
        assertSafeAttributeName(name, child.name);
        outputAttributes.set(name, value);
      }
      for (const [name, value] of authoredAttributes) {
        assertSafeAttributeName(name, child.name);
        assertSafeAuthoredAttributeValue(name, value, child.name);
        if (!allowed.has(name)) {
          throw new MarkdownError(
            `Attribute ${JSON.stringify(name)} is not allowed on <${child.name}>${locationFor(child)}`,
          );
        }
        outputAttributes.set(name, value);
      }

      transformed.push(...wrapperNodes(child, component.tagName, outputAttributes, "html"));
      continue;
    }

    if (/^[a-z]/.test(child.name)) {
      const outputAttributes = new Map<string, AttributeValue>();
      for (const [name, value] of authoredAttributes) outputAttributes.set(name, value);
      transformed.push(...wrapperNodes(
        child,
        child.name,
        outputAttributes,
        options.allowRawHtml ? "html" : "text",
      ));
      continue;
    }

    throw new MarkdownError(
      `Unregistered static MDX component <${child.name}>${locationFor(child)}`,
    );
  }

  parent.children = transformed;
}

function escapeRawHtmlPlugin() {
  return (tree: unknown): void => {
  const visit = (node: MutableNode): void => {
    if (node.children !== undefined) {
      for (const child of node.children) {
        if (child.type === "html") child.type = "text";
        visit(child);
      }
    }
  };
  visit(tree as unknown as MutableNode);
  };
}

function responsiveTablesPlugin() {
  return (tree: unknown): void => {
    const wrapTables = (parent: MutableNode): void => {
      if (parent.children === undefined) return;
      const transformed: MutableNode[] = [];

      for (const child of parent.children) {
        if (child.type === "element" && child.tagName === "table") {
          transformed.push({
            type: "element",
            tagName: "figure",
            properties: {
              className: ["content-table-scroll"],
              role: "region",
              ariaLabel: "표 가로 스크롤 영역",
              tabIndex: 0,
            },
            children: [child],
          });
          continue;
        }

        wrapTables(child);
        transformed.push(child);
      }

      parent.children = transformed;
    };

    wrapTables(tree as MutableNode);
  };
}

interface RestrictedMdxPluginOptions {
  allowRawHtml: boolean;
  components?: Readonly<Record<string, StaticMdxComponent>>;
}

function restrictedMdxPlugin(options: RestrictedMdxPluginOptions) {
  return (tree: unknown): void => {
    transformMdxChildren(tree as MutableNode, options);
  };
}

export async function renderMarkdown(
  source: string,
  options: MarkdownRenderOptions = {},
): Promise<MarkdownRenderResult> {
  const format = options.format ?? "markdown";
  const allowRawHtml = options.allowRawHtml ?? false;

  try {
    const processor = unified().use(remarkParse).use(remarkGfm);
    if (format === "mdx") processor.use(remarkMdx);
    if (!allowRawHtml) processor.use(escapeRawHtmlPlugin);
    if (format === "mdx") {
      processor.use(restrictedMdxPlugin, {
        allowRawHtml,
        components: options.components,
      });
    }

    const compiler = processor
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(responsiveTablesPlugin)
      .use(rehypeSlug)
      .use(rehypeAutolinkHeadings, { behavior: "wrap" })
      .use(rehypeExternalLinks, {
        target: "_blank",
        rel: ["noopener", "noreferrer"],
      })
      .use(rehypeStringify, { allowDangerousHtml: true });

    const result = await compiler.process(source);
    return { html: String(result) };
  } catch (error) {
    if (error instanceof MarkdownError) {
      if (options.sourcePath === undefined || error.sourcePath !== undefined) throw error;
      throw new MarkdownError(error.message, options.sourcePath);
    }
    throw new MarkdownError(
      error instanceof Error ? error.message : String(error),
      options.sourcePath,
    );
  }
}
