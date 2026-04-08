# Look up the authenticated principal — used for tenant_id and to grant the
# deployment Service Principal Key Vault Secrets Officer during bootstrap
data "azurerm_client_config" "current" {}

# Look up the shared ACR — created by infra/shared and referenced here by name
data "azurerm_container_registry" "acr" {
  name                = var.acr_name
  resource_group_name = "rg-app-insights-explorer-shared"
}

resource "azurerm_resource_group" "env" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_service_plan" "plan" {
  name                = "asp-aie-${var.environment}"
  resource_group_name = azurerm_resource_group.env.name
  location            = azurerm_resource_group.env.location
  os_type             = "Linux"
  sku_name            = var.app_service_plan_sku
}

resource "azurerm_key_vault" "kv" {
  name                       = var.key_vault_name
  resource_group_name        = azurerm_resource_group.env.name
  location                   = azurerm_resource_group.env.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  enable_rbac_authorization  = true
  purge_protection_enabled   = false
  soft_delete_retention_days = 7
}

resource "azurerm_linux_web_app" "web" {
  name                = var.web_app_name
  resource_group_name = azurerm_resource_group.env.name
  location            = azurerm_resource_group.env.location
  service_plan_id     = azurerm_service_plan.plan.id
  https_only          = true

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on = var.always_on
  }

  app_settings = {
    WEBSITES_PORT                    = "3000"
    DOCKER_REGISTRY_SERVER_URL       = "https://${data.azurerm_container_registry.acr.login_server}"
    DOCKER_CUSTOM_IMAGE_NAME         = "${data.azurerm_container_registry.acr.login_server}/app-insights-web:${var.image_tag}"
    acrUseManagedIdentityCreds       = "true"
    AppRegistrationClientId          = "@Microsoft.KeyVault(VaultName=${var.key_vault_name};SecretName=AppRegistrationClientId)"
    AppRegistrationTenantId        = "@Microsoft.KeyVault(VaultName=${var.key_vault_name};SecretName=AppRegistrationTenantId)"
    AppRegistrationClientSecret    = "@Microsoft.KeyVault(VaultName=${var.key_vault_name};SecretName=AppRegistrationClientSecret)"
    NextAuthSecret                 = "@Microsoft.KeyVault(VaultName=${var.key_vault_name};SecretName=NextAuthSecret)"
    NEXTAUTH_URL                   = "@Microsoft.KeyVault(VaultName=${var.key_vault_name};SecretName=NextAuthUrl)"
    NEXT_PUBLIC_API_URL            = "@Microsoft.KeyVault(VaultName=${var.key_vault_name};SecretName=NextPublicApiUrl)"
    NEXT_PUBLIC_BACKEND_API_SECRET = "@Microsoft.KeyVault(VaultName=${var.key_vault_name};SecretName=BackendApiSecret)"
  }
}

resource "azurerm_linux_web_app" "api" {
  name                = var.api_app_name
  resource_group_name = azurerm_resource_group.env.name
  location            = azurerm_resource_group.env.location
  service_plan_id     = azurerm_service_plan.plan.id
  https_only          = true

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on = var.always_on
  }

  app_settings = {
    WEBSITES_PORT                  = "3001"
    DOCKER_REGISTRY_SERVER_URL     = "https://${data.azurerm_container_registry.acr.login_server}"
    DOCKER_CUSTOM_IMAGE_NAME       = "${data.azurerm_container_registry.acr.login_server}/app-insights-api:${var.image_tag}"
    acrUseManagedIdentityCreds     = "true"
    ANTHROPIC_API_KEY              = "@Microsoft.KeyVault(VaultName=${var.key_vault_name};SecretName=AnthropicApiKey)"
    BACKEND_API_SECRET = "@Microsoft.KeyVault(VaultName=${var.key_vault_name};SecretName=BackendApiSecret)"
    FRONTEND_ORIGIN    = "@Microsoft.KeyVault(VaultName=${var.key_vault_name};SecretName=FrontendOrigin)"
  }
}

# ── Role assignments ─────────────────────────────────────────────────────────

# Web app — pull images from ACR
resource "azurerm_role_assignment" "web_acr_pull" {
  scope                = data.azurerm_container_registry.acr.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.web.identity[0].principal_id
}

# API app — pull images from ACR
resource "azurerm_role_assignment" "api_acr_pull" {
  scope                = data.azurerm_container_registry.acr.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.api.identity[0].principal_id
}

# Web app — read secrets from Key Vault at runtime
resource "azurerm_role_assignment" "web_kv_secrets_user" {
  scope                = azurerm_key_vault.kv.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_web_app.web.identity[0].principal_id
}

# API app — read secrets from Key Vault at runtime
resource "azurerm_role_assignment" "api_kv_secrets_user" {
  scope                = azurerm_key_vault.kv.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_web_app.api.identity[0].principal_id
}

# Deployment Service Principal — write secrets to Key Vault during bootstrap (Step 9a)
resource "azurerm_role_assignment" "cicd_kv_secrets_officer" {
  scope                = azurerm_key_vault.kv.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}
