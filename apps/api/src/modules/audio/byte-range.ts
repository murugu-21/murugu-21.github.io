export type ByteRange = { offset: number; length: number };

export function parseRange(
  header: string | null,
  size: number
): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  const [, first, last] = m;
  // "-n" asks for the final n bytes.
  const start = first === "" ? size - Math.min(Number(last), size) : Number(first);
  const end = first === "" || last === "" ? size - 1 : Math.min(Number(last), size - 1);
  if (start >= size || end < start) return "unsatisfiable";
  return { offset: start, length: end - start + 1 };
}

// RFC 9110 §13.1.2: "*" or a list of tags, compared weakly (a W/ prefix is ignored).
export function etagMatches({
  header,
  etag
}: {
  header: string | undefined;
  etag: string;
}): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  const opaque = (tag: string) => tag.trim().replace(/^W\//, "");
  return header.split(",").some(tag => opaque(tag) === opaque(etag));
}
