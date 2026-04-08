terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  use_oidc = true
  features {}
}

variable "image_tag" {
  type        = string
  description = "Docker image tag (git SHA) to deploy — passed in by the pipeline"
}

variable "acr_name" {
  type        = string
  description = "Name of the shared Azure Container Registry — passed in by the pipeline via TF_VAR_acr_name"
}

variable "acr_password" {
  type        = string
  sensitive   = true
  description = "ACR admin password — passed in by the pipeline via TF_VAR_acr_password"
}

module "app_service" {
  source = "../../modules/app-service"

  environment          = "test"
  location             = "westus2"
  resource_group_name  = "rg-app-insights-explorer-test"
  app_service_plan_sku = "B1"
  web_app_name         = "aie-web-test"
  api_app_name         = "aie-api-test"
  acr_name             = var.acr_name
  image_tag            = var.image_tag
  acr_password         = var.acr_password
  key_vault_name       = "kv-aie-test"
  always_on            = false
}

output "web_app_name"             { value = module.app_service.web_app_name }
output "api_app_name"             { value = module.app_service.api_app_name }
output "resource_group_name"      { value = module.app_service.resource_group_name }
output "web_app_default_hostname" { value = module.app_service.web_app_default_hostname }
output "api_app_default_hostname" { value = module.app_service.api_app_default_hostname }
output "key_vault_name"           { value = module.app_service.key_vault_name }
