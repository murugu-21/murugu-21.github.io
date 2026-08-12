# Enables Email Routing on the zone (creates the MX/SPF DNS records).
resource "cloudflare_email_routing_settings" "murugappan_dev" {
  zone_id = var.zone_id
}

# Destination mailbox. Cloudflare emails a verification link on create —
# the click is the one manual step; re-applying afterwards is a no-op.
resource "cloudflare_email_routing_address" "opportunity_inbox" {
  account_id = var.account_id
  email      = var.opportunity_inbox
}

# Human-facing alias, independent of the chatbot.
resource "cloudflare_email_routing_rule" "hello" {
  zone_id = var.zone_id
  name    = "hello forward"
  enabled = true

  matchers = [{
    type  = "literal"
    field = "to"
    value = "hello@murugappan.dev"
  }]

  actions = [{
    type  = "forward"
    value = [var.opportunity_inbox]
  }]

  depends_on = [cloudflare_email_routing_settings.murugappan_dev]
}
