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

// The compiler's ESTree AST, as JSON.
type AstValue = string | number | boolean | null | AstValue[] | Node;
type Node = { [key: string]: AstValue };

export type SpacingMistake = { line: number; text: string; kind: "joins words" | "pads element" };

type Finding = { node: Node; kind: SpacingMistake["kind"]; label?: string };

const isNode = (value: AstValue | undefined): value is Node =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// The node fields this file reads, with the type each holds when present.
const FIELD_TYPES = { value: "string", name: "string", start: "number" } as const;
type Fields = {
  [K in keyof typeof FIELD_TYPES]: { string: string; number: number }[(typeof FIELD_TYPES)[K]];
};

const hasField = <K extends keyof Fields>(
  node: Node | undefined,
  key: K
): node is Node & Pick<Fields, K> => typeof node?.[key] === FIELD_TYPES[key];

const child = (node: Node | undefined, key: string): Node | undefined => {
  const value = node?.[key];
  return isNode(value) ? value : undefined;
};

const textOf = (node: Node | undefined): string | undefined =>
  node?.type === "JSXText" && hasField(node, "value") ? node.value : undefined;

const elementName = (node: Node | undefined): string | undefined => {
  const name = child(child(node, "openingElement"), "name");
  return hasField(name, "name") ? name.name : undefined;
};

/** True when the node renders beside its neighbours on the same line. */
function isInline(node: Node | undefined): boolean {
  if (node?.type === "JSXExpressionContainer") {
    // {" "} is the explicit space that survives compression.
    const expression = child(node, "expression");
    return !(hasField(expression, "value") && expression.value.trim() === "");
  }
  const name = node?.type === "JSXElement" ? elementName(node) : undefined;
  return name !== undefined && !BLOCK_ELEMENTS.has(name);
}

/** Text that opens or closes an inline element with a space, which compression keeps. */
function paddedEdges(kids: Node[]): Finding[] {
  const first = kids[0];
  const last = kids.at(-1);
  const padsStart = /^[ \t]+\S/.test(textOf(first) ?? "");
  const padsEnd = /\S[ \t]+$/.test(textOf(last) ?? "");
  const found: Finding[] = [];
  if (first && padsStart) found.push({ node: first, kind: "pads element" });
  // A lone child padded at both ends is one mistake.
  if (last && padsEnd && !(last === first && padsStart)) {
    found.push({ node: last, kind: "pads element" });
  }
  return found;
}

/** Text whose line break beside an inline neighbour is deleted, running words together. */
function joinedWords(kids: Node[]): Finding[] {
  const isProse = kids.some(kid => textOf(kid)?.trim());
  const found: Finding[] = [];
  for (const [i, node] of kids.entries()) {
    const text = textOf(node);
    if (text === undefined) continue;
    const next = kids[i + 1];
    const breakAfterPrevious = isInline(kids[i - 1]) && /^\s*\n/.test(text);
    const breakBeforeNext = isInline(next) && /\n\s*$/.test(text);
    const words = text.trim();
    if (words === "") {
      // Two inline elements on separate lines run together in a sentence.
      if (isProse && breakAfterPrevious && breakBeforeNext) {
        found.push({ node, kind: "joins words", label: `before <${elementName(next) ?? "{…}"}>` });
      }
      continue;
    }
    if (breakAfterPrevious && !STARTS_WITH_CLOSER.test(words)) {
      found.push({ node, kind: "joins words" });
    }
    if (breakBeforeNext && !ENDS_WITH_OPENER.test(words)) {
      found.push({ node, kind: "joins words" });
    }
  }
  return found;
}

/** Walks the template AST, in source order, for padded elements and joined words. */
function collectFindings(value: AstValue, inExpression: boolean): Finding[] {
  if (Array.isArray(value)) return value.flatMap(item => collectFindings(item, inExpression));
  // A <pre> keeps its whitespace.
  if (!isNode(value) || elementName(value) === "pre") return [];
  const isExpression = value.type === "JSXExpressionContainer";
  const nested = Object.entries(value).flatMap(([key, v]) =>
    key === "frontmatter" ? [] : collectFindings(v, inExpression || isExpression)
  );
  // Text directly inside {…} is JavaScript, not page text.
  if (isExpression || !Array.isArray(value.children)) return nested;
  const kids = value.children.filter(isNode);
  // Markup inside {…} is JSX, where a space beside a tag on the same line is meant, so only
  // template markup can be padded by mistake.
  const padded = !inExpression && isInline(value) ? paddedEdges(kids) : [];
  return [...padded, ...joinedWords(kids), ...nested];
}

function toMistake(source: string, { node, kind, label }: Finding): SpacingMistake {
  const text = textOf(node) ?? "";
  if (!hasField(node, "start")) throw new Error(`no position for ${JSON.stringify(text)}`);
  const firstWord = node.start + text.length - text.trimStart().length;
  const line = source.slice(0, firstWord).split("\n").length;
  return { line, text: label ?? text.trim().slice(0, 40), kind };
}

/** Spots where the rendered spacing differs from what the source reads. */
export function spacingMistakes(source: string): SpacingMistake[] {
  return collectFindings(parse(source).ast, false)
    .map(finding => toMistake(source, finding))
    .toSorted((a, b) => a.line - b.line);
}
