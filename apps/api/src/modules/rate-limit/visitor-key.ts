import { z } from "zod";

export const VisitorKey = z.string().brand<"VisitorKey">();
export type VisitorKey = z.infer<typeof VisitorKey>;

const SHARED_UNKNOWN_VISITOR = VisitorKey.parse("unknown");

const IPv4 = z.ipv4();
const IPv6 = z.ipv6();
const MAPPED_IPV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/;

// An embedded IPv4 tail ("64:ff9b::1.2.3.4") fills two of the eight groups.
const groupWidth = (groups: string[]) =>
  groups.reduce((width, group) => width + (group.includes(".") ? 2 : 1), 0);

function ipv6Prefix(ip: string): string {
  const [head = "", tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const zeros = Array.from({ length: 8 - groupWidth(left) - groupWidth(right) }, () => "0");
  const groups = [...left, ...zeros, ...right].slice(0, 4);
  return `${groups.map(group => Number.parseInt(group, 16).toString(16)).join(":")}::/64`;
}

/**
 * The bucket a client's address counts against. An IPv6 client usually holds a whole /64, so
 * every address in it gets one key.
 */
export function visitorKey(ip: string | null | undefined): VisitorKey {
  const trimmed = ip?.trim().toLowerCase() ?? "";
  const address = MAPPED_IPV4.exec(trimmed)?.[1] ?? trimmed;
  if (IPv4.safeParse(address).success) return VisitorKey.parse(address);
  if (IPv6.safeParse(address).success) return VisitorKey.parse(ipv6Prefix(address));
  return SHARED_UNKNOWN_VISITOR;
}
