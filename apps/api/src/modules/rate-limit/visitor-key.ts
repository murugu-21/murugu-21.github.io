import ipaddr from "ipaddr.js";
import { z } from "zod";

export const VisitorKey = z.string().brand<"VisitorKey">();
export type VisitorKey = z.infer<typeof VisitorKey>;

const SHARED_UNKNOWN_VISITOR = VisitorKey.parse("unknown");

// A bare IPv4 address must be dotted decimal, since ipaddr.js also accepts inet_aton forms
// ("127.1", "010.1.1.1").
function parseAddress(ip: string) {
  if (ipaddr.IPv4.isValidFourPartDecimal(ip)) return ipaddr.IPv4.parse(ip);
  if (ipaddr.IPv6.isValid(ip)) return ipaddr.process(ip);
  return null;
}

/**
 * The bucket a client's address counts against. An IPv6 client usually holds a whole /64, so
 * every address in it gets one key.
 */
export function visitorKey(ip: string | null | undefined): VisitorKey {
  const address = parseAddress(ip?.trim() ?? "");
  if (!address) return SHARED_UNKNOWN_VISITOR;
  if (address instanceof ipaddr.IPv4) return VisitorKey.parse(address.toString());
  const network = address.parts.slice(0, 4).map(part => part.toString(16));
  return VisitorKey.parse(`${network.join(":")}::/64`);
}
