import { parse, serialize } from "parse5";

interface MutableHtmlNode {
  nodeName: string;
  childNodes?: MutableHtmlNode[];
  data?: string;
}

function stripComments(node: MutableHtmlNode): void {
  if (!node.childNodes) return;
  node.childNodes = node.childNodes.filter((child) => {
    if (child.nodeName !== "#comment") return true;
    // Preserve intentional legacy conditional comments.
    return /^\s*\[if\b/iu.test(child.data ?? "");
  });
  for (const child of node.childNodes) stripComments(child);
}

/**
 * Apply a conservative HTML minification pass. Text-node whitespace remains
 * untouched, so prose, inline elements, `pre`, and `textarea` keep their exact
 * semantics. A real HTML tree is used instead of regex-based markup parsing.
 */
export function minifyHtmlDocument(html: string): string {
  const document = parse(html);
  stripComments(document as unknown as MutableHtmlNode);
  return serialize(document);
}
