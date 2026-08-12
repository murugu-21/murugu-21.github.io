# Email Routing enablement (MX/SPF DNS records) is a one-time dashboard click:
# zone -> Email -> Email Routing -> Enable. The cloudflare_email_routing_settings
# resource is unusable in provider ~5.23 (schema drift: "support_subaddress"
# field mismatch -> Value Conversion Error on every apply), so it is deliberately
# not managed here. Re-check the provider changelog before re-adopting it.

# Destination mailbox. Cloudflare emails a verification link on create —
# the click is the one manual step; re-applying afterwards is a no-op.
resource "cloudflare_email_routing_address" "opportunity_inbox" {
  account_id = var.account_id
  email      = var.opportunity_inbox
}

# The hello@murugappan.dev -> inbox forward rule is dashboard-managed, not
# Terraform-managed: zone-level Email Routing writes returned 403 for the
# account-owned API token used here (account-level writes worked fine), and a
# single rule wasn't worth a second token type. Recreate via: Email ->
# Email Routing -> Routing rules -> Create address.
