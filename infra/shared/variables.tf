variable "location" {
  type        = string
  default     = "westus2"
  description = "Azure region for shared resources"
}

variable "acr_name" {
  type        = string
  description = "Globally unique name for the Azure Container Registry (without .azurecr.io)"
}

variable "cicd_sp_object_id" {
  type        = string
  description = "Object ID of the CI/CD Service Principal created by bootstrap.sh"
}

variable "cicd_sp_app_id" {
  type        = string
  description = "App (client) ID of the CI/CD Service Principal — set as AZURE_CLIENT_ID GitHub Variable"
}

variable "github_token" {
  type        = string
  sensitive   = true
  description = "GitHub Personal Access Token with repo scope — used by the GitHub Terraform provider"
}

variable "github_owner" {
  type        = string
  default     = "frankendoodle"
  description = "GitHub username (personal account)"
}

variable "github_repo" {
  type        = string
  default     = "app-insights-explorer"
  description = "GitHub repository name"
}

variable "tf_backend_resource_group" {
  type        = string
  description = "Resource group of the Terraform state storage account — created by bootstrap.sh"
}

variable "tf_backend_storage_account" {
  type        = string
  description = "Name of the Terraform state storage account — created by bootstrap.sh"
}

variable "sso_test_hostname" {
  type        = string
  description = "Hostname of the frontend App Service in test (e.g. aie-web-test.azurewebsites.net)"
}

variable "sso_staging_hostname" {
  type        = string
  description = "Hostname of the frontend App Service in staging (e.g. aie-web-staging.azurewebsites.net)"
}
