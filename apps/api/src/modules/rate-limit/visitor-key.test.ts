import { describe, expect, it } from "vite-plus/test";

import { visitorKey } from "#src/modules/rate-limit/visitor-key.ts";

describe("visitorKey", () => {
  it.each([
    { ip: "203.0.113.7", key: "203.0.113.7" },
    { ip: " 203.0.113.7 ", key: "203.0.113.7" },
    { ip: "2001:DB8:0:0:1::1", key: "2001:db8:0:0::/64" },
    { ip: "2001:db8::2", key: "2001:db8:0:0::/64" },
    { ip: "2001:0db8:0000:0001:aaaa:bbbb:cccc:dddd", key: "2001:db8:0:1::/64" },
    { ip: "::1", key: "0:0:0:0::/64" },
    { ip: "fe80:1:2:3::", key: "fe80:1:2:3::/64" },
    { ip: "::ffff:198.51.100.1", key: "198.51.100.1" },
    { ip: "::FFFF:198.51.100.1", key: "198.51.100.1" },
    { ip: "::ffff:c633:6401", key: "198.51.100.1" },
    { ip: "0:0:0:0:0:ffff:198.51.100.1", key: "198.51.100.1" },
    { ip: "0:0:0:0:0:FFFF:c633:6401", key: "198.51.100.1" },
    { ip: "fe80::1%eth0", key: "fe80:0:0:0::/64" },
    { ip: "1:2:3::5:6:7.8.9.10", key: "1:2:3:0::/64" },
    { ip: "not an ip", key: "unknown" },
    { ip: "999.1.1.1", key: "unknown" },
    { ip: "127.1", key: "unknown" },
    { ip: "010.1.1.1", key: "unknown" },
    { ip: "", key: "unknown" },
    { ip: null, key: "unknown" },
    { ip: undefined, key: "unknown" }
  ])("keys $ip as $key", ({ ip, key }) => {
    expect(visitorKey(ip)).toBe(key);
  });
});
