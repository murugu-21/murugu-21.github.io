terraform {
  required_version = ">= 1.6"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# Auth: var.cloudflare_api_token (from gitignored terraform.tfvars) when set,
# otherwise the CLOUDFLARE_API_TOKEN environment variable.
provider "cloudflare" {
  api_token = var.cloudflare_api_token != "" ? var.cloudflare_api_token : null
}
