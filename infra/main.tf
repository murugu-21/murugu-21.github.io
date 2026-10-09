# Enabling Email Routing is a dashboard click (zone -> Email -> Email
# Routing -> Enable). cloudflare_email_routing_settings fails every apply in
# provider ~5.23 ("support_subaddress" Value Conversion Error).

# Cloudflare emails a verification link on create; that click is manual.
resource "cloudflare_email_routing_address" "opportunity_inbox" {
  account_id = var.account_id
  email      = var.opportunity_inbox
}

# The hello@ -> inbox forward rule is dashboard-managed because zone-level
# Email Routing writes return 403 for this account-owned token. Recreate it
# via Email -> Email Routing -> Routing rules -> Create address.

# Private bucket for blog audio (blog/*, served by the Worker's /blog/audio/*)
# and the voice reference (voice/*, never served).
resource "cloudflare_r2_bucket" "blog_audio" {
  account_id = var.account_id
  name       = "murugappan-dev-audio"
}
