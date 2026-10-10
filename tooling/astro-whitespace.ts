import { parse } from "@astrojs/compiler-rs";

// Astro's default compressHTML ("jsx") deletes whitespace holding a newline beside a tag or an
// expression and keeps other whitespace, so a line break can join words and a space can pad a link.
// eslint-plugin-react's jsx-child-element-spacing checks only inline HTML elements, not
// expressions or components, and oxlint won't port it, so this extends the same idea.

// Elements that start a new line anyway, so whitespace beside them never shows.
const BLOCK_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "details",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "script",
  "section",
  "style",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul"
]);

// No space is wanted after an opening bracket or quote, or before closing punctuation.
const ENDS_WITH_OPENER = /[([{“‘"'/]$/;
const STARTS_WITH_CLOSER = /^[.,;:!?)\]}”’"'/%-]/;

type Node = Record<string, unknown>;

export type SpacingMistake = { line: number; text: string; kind: "joins words" | "pads element" };

const isNode = (value: unknown): value is Node => typeof value === "object" && value !== null;

const child = (node: Node | undefined, key: string): Node | undefined => {
  const value = node?.[key];
  return isNode(value) ? value : undefined;
};

const textOf = (node: Node | undefined): string | undefined =>
  node?.type === "JSXText" && typeof node.value === "string" ? node.value : undefined;

const elementName = (node: Node): unknown => child(child(node, "openingElement"), "name")?.name;

/** True when the node renders beside its neighbours on the same line. */
function isInline(node: Node | undefined): boolean {
  if (node?.type === "JSXExpressionContainer") {
    // {" "} is the explicit space that survives compression.
    const value = child(node, "expression")?.value;
    return !(typeof value === "string" && value.trim() === "");
  }
  const name = node?.type === "JSXElement" ? elementName(node) : undefined;
  return typeof name === "string" && !BLOCK_ELEMENTS.has(name);
}

/** Spots where the rendered spacing differs from what the source reads. */
export function spacingMistakes(source: string): SpacingMistake[] {
  const found: SpacingMistake[] = [];
  const report = (node: Node, kind: SpacingMistake["kind"], label?: string) => {
    const text = textOf(node) ?? "";
    if (typeof node.start !== "number") throw new Error(`no position for ${JSON.stringify(text)}`);
    const firstWord = node.start + text.length - text.trimStart().length;
    const line = source.slice(0, firstWord).split("\n").length;
    found.push({ line, text: label ?? text.trim().slice(0, 40), kind });
  };

  const checkChildren = (parent: Node, kids: Node[], inExpression: boolean) => {
    // Markup inside {…} is JSX, where a space beside a tag on the same line is meant, so only
    // template markup can be padded by mistake.
    if (!inExpression && isInline(parent)) {
      const first = kids[0];
      const last = kids.at(-1);
      const padsStart = first !== undefined && /^[ \t]+\S/.test(textOf(first) ?? "");
      if (padsStart) report(first, "pads element");
      if (last && !(last === first && padsStart) && /\S[ \t]+$/.test(textOf(last) ?? "")) {
        report(last, "pads element");
      }
    }
    const isProse = kids.some(kid => textOf(kid)?.trim());
    kids.forEach((kid, i) => {
      const text = textOf(kid);
      if (text === undefined) return;
      const words = text.trim();
      const next = kids[i + 1];
      const breakAfterPrevious = isInline(kids[i - 1]) && /^\s*\n/.test(text);
      const breakBeforeNext = isInline(next) && /\n\s*$/.test(text);
      if (words === "") {
        // Two inline elements on separate lines run together in a sentence.
        if (isProse && breakAfterPrevious && breakBeforeNext && next) {
          const name = elementName(next);
          report(kid, "joins words", `before <${typeof name === "string" ? name : "{…}"}>`);
        }
        return;
      }
      if (breakAfterPrevious && !STARTS_WITH_CLOSER.test(words)) report(kid, "joins words");
      if (breakBeforeNext && !ENDS_WITH_OPENER.test(words)) report(kid, "joins words");
    });
  };

  const visit = (value: unknown, inExpression: boolean): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, inExpression);
      return;
    }
    // A <pre> keeps its whitespace.
    if (!isNode(value) || elementName(value) === "pre") return;
    const isExpression = value.type === "JSXExpressionContainer";
    // Text directly inside {…} is JavaScript, not page text.
    if (Array.isArray(value.children) && !isExpression) {
      checkChildren(value, value.children.filter(isNode), inExpression);
    }
    for (const [key, v] of Object.entries(value)) {
      if (key !== "frontmatter") visit(v, inExpression || isExpression);
    }
  };

  visit(parse(source).ast, false);
  return found.toSorted((a, b) => a.line - b.line);
}
