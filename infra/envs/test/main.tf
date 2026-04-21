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

variable "acr_name" {
  type        = string
  description = "Name of the shared Azure Container Registry — passed in by the pipeline via TF_VAR_acr_name"
}

variable "admin_object_id" {
  type        = string
  description = "Object ID of the admin user — passed in via TF_VAR_admin_object_id"
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
  admin_object_id      = var.admin_object_id
  key_vault_name       = "kv-aie-test"
  always_on            = false
}

output "web_app_name"             { value = module.app_service.web_app_name }
output "api_app_name"             { value = module.app_service.api_app_name }
output "resource_group_name"      { value = module.app_service.resource_group_name }
output "web_app_default_hostname" { value = module.app_service.web_app_default_hostname }
output "api_app_default_hostname" { value = module.app_service.api_app_default_hostname }
output "key_vault_name"           { value = module.app_service.key_vault_name }
