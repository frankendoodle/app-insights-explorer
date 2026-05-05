output "acr_login_server" {
  description = "ACR login server URL — set as GitHub Actions Variable ACR_LOGIN_SERVER after apply."
  value       = azurerm_container_registry.main.login_server
}

output "acr_id" {
  description = "ACR resource ID — pass as var.acr_id to infra/envs/test/."
  value       = azurerm_container_registry.main.id
}
