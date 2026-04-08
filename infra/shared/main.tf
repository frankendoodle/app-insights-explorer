terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

provider "azurerm" {
  use_oidc = true
  features {}
}

provider "azuread" {
  use_oidc = true
}

provider "github" {
  token = var.github_token
  owner = var.github_owner
}

data "azurerm_client_config" "current" {}

# ── Azure Container Registry ──────────────────────────────────────────────────

resource "azurerm_resource_group" "shared" {
  name     = "rg-app-insights-explorer-shared"
  location = var.location
}

resource "azurerm_container_registry" "acr" {
  name                = var.acr_name
  resource_group_name = azurerm_resource_group.shared.name
  location            = azurerm_resource_group.shared.location
  sku                 = "Basic"
  admin_enabled       = false  # images pulled via managed identity, not credentials
}

# ── CI/CD Service Principal — OIDC federated credentials ─────────────────────
# The SP itself was created by bootstrap.sh; here we attach the federated
# credentials that allow GitHub Actions to authenticate as this SP via OIDC.

data "azuread_application" "cicd_sp" {
  object_id = var.cicd_sp_object_id
}

data "azuread_service_principal" "cicd_sp" {
  client_id = var.cicd_sp_app_id
}

resource "azuread_application_federated_identity_credential" "pr" {
  application_id = data.azuread_application.cicd_sp.id
  display_name   = "github-pr"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_owner}/${var.github_repo}:pull_request"
}

resource "azuread_application_federated_identity_credential" "ci" {
  application_id = data.azuread_application.cicd_sp.id
  display_name   = "github-ci"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_owner}/${var.github_repo}:ref:refs/heads/development"
}

resource "azuread_application_federated_identity_credential" "ci_env_test" {
  application_id = data.azuread_application.cicd_sp.id
  display_name   = "github-ci-env-test"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_owner}/${var.github_repo}:environment:test"
}

# AcrPush — allows the pipeline to push built images to the registry
resource "azurerm_role_assignment" "cicd_acr_push" {
  scope                = azurerm_container_registry.acr.id
  role_definition_name = "AcrPush"
  principal_id         = data.azuread_service_principal.cicd_sp.object_id
}

# ── SSO App Registration ──────────────────────────────────────────────────────

resource "azuread_application" "sso" {
  display_name = "app-insights-explorer-sso"

  web {
    redirect_uris = [
      "http://localhost:3000/api/auth/callback/microsoft-entra-id",
      "https://${var.sso_test_hostname}/api/auth/callback/microsoft-entra-id",
    ]
  }

  required_resource_access {
    resource_app_id = "00000003-0000-0000-c000-000000000000" # Microsoft Graph

    resource_access {
      id   = "e1fe6dd8-ba31-4d61-89e7-88639da4683d" # User.Read
      type = "Scope"
    }
  }
}

resource "azuread_service_principal" "sso" {
  client_id = azuread_application.sso.client_id
}

resource "azuread_application_password" "sso" {
  application_id = azuread_application.sso.id
  display_name   = "terraform-managed"
}

# ── GitHub Actions Variables ──────────────────────────────────────────────────

resource "github_actions_variable" "azure_client_id" {
  repository    = var.github_repo
  variable_name = "AZURE_CLIENT_ID"
  value         = var.cicd_sp_app_id
}

resource "github_actions_variable" "azure_tenant_id" {
  repository    = var.github_repo
  variable_name = "AZURE_TENANT_ID"
  value         = data.azurerm_client_config.current.tenant_id
}

resource "github_actions_variable" "azure_subscription_id" {
  repository    = var.github_repo
  variable_name = "AZURE_SUBSCRIPTION_ID"
  value         = data.azurerm_client_config.current.subscription_id
}

resource "github_actions_variable" "tf_backend_resource_group" {
  repository    = var.github_repo
  variable_name = "TF_BACKEND_RESOURCE_GROUP"
  value         = var.tf_backend_resource_group
}

resource "github_actions_variable" "tf_backend_storage_account" {
  repository    = var.github_repo
  variable_name = "TF_BACKEND_STORAGE_ACCOUNT"
  value         = var.tf_backend_storage_account
}

resource "github_actions_variable" "acr_name" {
  repository    = var.github_repo
  variable_name = "ACR_NAME"
  value         = azurerm_container_registry.acr.name
}

# ── GitHub Branch Protection ──────────────────────────────────────────────────

resource "github_branch_protection" "development" {
  repository_id = var.github_repo
  pattern       = "development"

  required_status_checks {
    strict   = true
    contexts = ["Build Web", "Build API", "Terraform Plan (test)"]
  }

  allows_force_pushes = false
  allows_deletions    = false
}

# ── GitHub Environment ────────────────────────────────────────────────────────

resource "github_repository_environment" "test" {
  repository  = var.github_repo
  environment = "test"
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "acr_login_server" {
  value       = azurerm_container_registry.acr.login_server
  description = "ACR login server"
}

output "sso_client_id" {
  value       = azuread_application.sso.client_id
  description = "SSO App Registration client ID — store in Key Vault as AppRegistrationClientId"
}

output "sso_client_secret" {
  value       = azuread_application_password.sso.value
  sensitive   = true
  description = "SSO App Registration client secret — store in Key Vault as AppRegistrationClientSecret"
}
