export const VISITOR_COUNTRY_HEADER = "x-visitor-country";
export const VISITOR_IP_HEADER = "x-visitor-ip";

export const CONVERSATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const MAX_STORED_HEADER_CHARS = 64;

export type VisitorContext = { country: string | null; ip: string | null };

export function parseVisitorContext(headers: Headers): VisitorContext | null {
  const country = cleanHeader(headers.get(VISITOR_COUNTRY_HEADER));
  const ip = cleanHeader(headers.get(VISITOR_IP_HEADER));
  if (!country && !ip) return null;
  return { country, ip };
}

function cleanHeader(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, MAX_STORED_HEADER_CHARS) : null;
}
