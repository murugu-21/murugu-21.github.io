/** Decodes a JSON string array stamped into a data attribute; anything else reads as empty. */
export function parseStringArray(json: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return [];
  }
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string")
    ? value
    : [];
}
