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

# Markdown for Agents: rewrite Accept: text/markdown page requests to the
# build-time static renditions (dist/**/index.md, see
# scripts/generate-markdown.mjs) at the zone edge — the Worker never runs, so
# page views stay on the free unlimited asset path. Two rules because the
# free plan has no regex rewrites (trailing-slash vs extensionless paths).
# Pages without a rendition (only /resume/, which is noindexed) 404 to
# markdown-requesting agents instead of falling back to HTML.
#
# Token scope needed: Zone -> Transform Rules -> Edit. If apply 403s (as
# zone-level Email Routing writes did), add that permission to the token —
# or create both rules by hand: Rules -> Create rule -> Rewrite URL, same
# expressions, dynamic path rewrite.
# NOTE: this manages the zone's http_request_transform phase entrypoint —
# any URL-rewrite rules added via the dashboard would be overwritten on
# apply; keep them all here.
resource "cloudflare_ruleset" "markdown_for_agents" {
  zone_id = var.zone_id
  name    = "Markdown for Agents"
  kind    = "zone"
  phase   = "http_request_transform"

  rules = [
    {
      ref         = "markdown_agents_trailing_slash"
      description = "Accept: text/markdown on directory paths -> index.md"
      expression  = "any(http.request.headers[\"accept\"][*] contains \"text/markdown\") and ends_with(http.request.uri.path, \"/\")"
      action      = "rewrite"
      action_parameters = {
        uri = {
          path = {
            expression = "concat(http.request.uri.path, \"index.md\")"
          }
        }
      }
    },
    {
      ref         = "markdown_agents_extensionless"
      description = "Accept: text/markdown on extensionless paths -> /index.md"
      expression  = "any(http.request.headers[\"accept\"][*] contains \"text/markdown\") and not ends_with(http.request.uri.path, \"/\") and not http.request.uri.path contains \".\""
      action      = "rewrite"
      action_parameters = {
        uri = {
          path = {
            expression = "concat(http.request.uri.path, \"/index.md\")"
          }
        }
      }
    }
  ]
}
