ALTER TABLE rooms ADD COLUMN visitor_key TEXT;

-- `ip` is Cloudflare's CF-Connecting-IP, always canonical, so an IPv4 one is its own key. IPv6
-- keys stay NULL until the visitor next connects: SQL can't reduce an address to its /64.
UPDATE rooms SET visitor_key = ip
WHERE ip NOT GLOB '*[^0-9.]*' AND length(ip) - length(replace(ip, '.', '')) = 3;

-- A room last seen over 30 days ago may never wake to run its own erase.
UPDATE rooms SET ip = NULL, visitor_key = NULL WHERE last_seen < (unixepoch() - 30 * 86400) * 1000;
