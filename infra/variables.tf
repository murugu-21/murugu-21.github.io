variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  default     = ""
  description = "API token (Zone Settings/DNS/Email Routing write). Prefer a disposable token; falls back to the CLOUDFLARE_API_TOKEN env var when unset."
}

variable "account_id" {
  type        = string
  description = "Cloudflare account id (dashboard → account home → Account ID)."
}

variable "zone_id" {
  type        = string
  description = "Zone id for murugappan.dev."
}

variable "opportunity_inbox" {
  type        = string
  sensitive   = true
  description = "Real mailbox that receives opportunity emails and hello@ forwards. Never committed."
}
