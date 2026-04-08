variable "environment" {
  type        = string
  description = "Environment name (test / staging / prod)"
}

variable "location" {
  type        = string
  description = "Azure region"
}

variable "resource_group_name" {
  type        = string
  description = "Name of the resource group to create for this environment"
}

variable "app_service_plan_sku" {
  type        = string
  description = "App Service Plan SKU (e.g. B1 for test, P1v3 for staging/prod)"
}

variable "web_app_name" {
  type        = string
  description = "Name of the frontend App Service"
}

variable "api_app_name" {
  type        = string
  description = "Name of the backend App Service"
}

variable "acr_name" {
  type        = string
  description = "Name of the shared Azure Container Registry (without .azurecr.io)"
}

variable "image_tag" {
  type        = string
  description = "Docker image tag (git SHA) to deploy — passed in by the pipeline"
}

variable "key_vault_name" {
  type        = string
  description = "Globally unique name for the Key Vault for this environment (e.g. kv-aie-test)"
}

variable "acr_password" {
  type        = string
  sensitive   = true
  description = "ACR admin password — passed in by the pipeline via TF_VAR_acr_password"
}

variable "always_on" {
  type        = bool
  default     = false
  description = "Whether to keep the App Service always warm — false for test (B1 SKU), true for staging/prod"
}
