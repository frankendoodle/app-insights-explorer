output "acr_login_server" {
  description = "ACR login server URL — set as GitHub Actions Variable ACR_LOGIN_SERVER after apply."
  value       = azurerm_container_registry.main.login_server
}

output "acr_id" {
  description = "ACR resource ID — pass as var.acr_id to infra/envs/test/."
  value       = azurerm_container_registry.main.id
}

output "sso_client_id" {
  description = "SSO App Registration client ID — set as GitHub Secret AZURE_AD_CLIENT_ID and pass as var.sso_client_id to infra/envs/test/."
  value       = azuread_application.sso.client_id
}

output "sso_sp_object_id" {
  description = "SSO Service Principal object ID."
  value       = azuread_service_principal.sso.object_id
}
