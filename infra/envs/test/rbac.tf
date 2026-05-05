# AcrPull — frontend managed identity → ACR
resource "azurerm_role_assignment" "frontend_acr_pull" {
  scope                = var.acr_id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.frontend.identity[0].principal_id
}

# AcrPull — API managed identity → ACR
resource "azurerm_role_assignment" "api_acr_pull" {
  scope                = var.acr_id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.api.identity[0].principal_id
}

# Key Vault Secrets User — frontend managed identity → Key Vault
resource "azurerm_role_assignment" "frontend_kv_secrets_user" {
  scope                = azurerm_key_vault.test.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_web_app.frontend.identity[0].principal_id
}

# Key Vault Secrets User — API managed identity → Key Vault
resource "azurerm_role_assignment" "api_kv_secrets_user" {
  scope                = azurerm_key_vault.test.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_web_app.api.identity[0].principal_id
}

# Key Vault Secrets Officer — CI/CD service principal → Key Vault
# The CI step (az keyvault secret set) runs as the CI/CD SP. Key Vault RBAC
# authorization mode does not grant data plane access via Contributor — a
# Secrets Officer assignment is required separately.
resource "azurerm_role_assignment" "cicd_kv_secrets_officer" {
  scope                = azurerm_key_vault.test.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = var.cicd_sp_object_id
}
