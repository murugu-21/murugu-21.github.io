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

# Rewrite Accept: text/markdown page requests to the static **/index.md
# renditions at the edge, so the Worker never runs. Two rules because the free
# plan has no regex rewrites. Pages without a rendition (/resume/) 404.
# This owns the zone's http_request_transform entrypoint, and an apply
# overwrites dashboard-added rewrite rules, so keep them all here.
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

# Private bucket for blog audio (blog/*, served by the Worker's /blog/audio/*)
# and the voice reference (voice/*, never served).
resource "cloudflare_r2_bucket" "blog_audio" {
  account_id = var.account_id
  name       = "murugappan-dev-audio"
}
