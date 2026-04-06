output "web_app_name" {
  value       = azurerm_linux_web_app.web.name
  description = "Name of the frontend App Service — used by pipeline for container image updates"
}

output "api_app_name" {
  value       = azurerm_linux_web_app.api.name
  description = "Name of the backend App Service — used by pipeline for container image updates"
}

output "resource_group_name" {
  value       = azurerm_resource_group.env.name
  description = "Resource group containing the app resources — passed to pipeline so it does not need a separate GitHub Variable"
}

output "web_app_default_hostname" {
  value       = azurerm_linux_web_app.web.default_hostname
  description = "Default hostname of the frontend App Service — used by smoke test"
}

output "api_app_default_hostname" {
  value       = azurerm_linux_web_app.api.default_hostname
  description = "Default hostname of the backend App Service — used by smoke test"
}

output "key_vault_name" {
  value       = azurerm_key_vault.kv.name
  description = "Key Vault name — reference when running the Step 9a secret bootstrap"
}
