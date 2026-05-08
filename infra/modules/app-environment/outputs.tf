output "webapp_frontend_name" {
  description = "Frontend web app name — set as GitHub Actions Variable WEBAPP_FRONTEND after apply."
  value       = azurerm_linux_web_app.frontend.name
}

output "webapp_api_name" {
  description = "API web app name — set as GitHub Actions Variable WEBAPP_API after apply."
  value       = azurerm_linux_web_app.api.name
}

output "kv_name" {
  description = "Key Vault name — used by the CI secret-population step."
  value       = azurerm_key_vault.test.name
}

output "kv_uri" {
  description = "Key Vault URI — used to construct Key Vault reference strings in App Service settings."
  value       = azurerm_key_vault.test.vault_uri
}
