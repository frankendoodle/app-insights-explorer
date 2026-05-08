variable "env_name" {
  description = "Environment name used in all Azure resource names (e.g. 'test', 'staging', 'production')."
  type        = string
}

variable "suffix" {
  description = "Short personal suffix appended to resource names to ensure uniqueness (e.g. 'tfg')."
  type        = string
}

variable "acr_login_server" {
  description = "Login server URL for the ACR provisioned by infra/shared/. Retrieve from: terraform -chdir=infra/shared output acr_login_server"
  type        = string
}

variable "acr_id" {
  description = "Resource ID of the ACR provisioned by infra/shared/. Retrieve from: terraform -chdir=infra/shared output acr_id"
  type        = string
}

variable "sso_client_id" {
  description = "Application (client) ID of the SSO App Registration provisioned by infra/shared/. Retrieve from: terraform -chdir=infra/shared output sso_client_id"
  type        = string
}

variable "cicd_sp_object_id" {
  description = "Object ID of the CI/CD service principal created by bootstrap.sh. Required to grant Key Vault Secrets Officer so the CI step can write secrets."
  type        = string
}

variable "sku_name" {
  description = "App Service plan SKU. All environments share a single plan — per-app plan separation is out of scope."
  type        = string
  default     = "B1"
}
