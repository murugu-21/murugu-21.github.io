variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  default     = ""
  description = "API token (Email Routing addresses and R2 edit). Prefer a disposable token. When unset, the provider falls back to the CLOUDFLARE_API_TOKEN env var."
}

variable "account_id" {
  type        = string
  description = "Cloudflare account id (dashboard -> account home -> Account ID)."
}

variable "opportunity_inbox" {
  type        = string
  sensitive   = true
  description = "Real mailbox that receives opportunity emails and hello@ forwards. Never committed."
}
