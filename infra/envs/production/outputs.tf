output "webapp_frontend_name" {
  description = "Frontend web app name — set as GitHub Actions Variable WEBAPP_FRONTEND after apply."
  value       = module.app_environment.webapp_frontend_name
}

output "webapp_api_name" {
  description = "API web app name — set as GitHub Actions Variable WEBAPP_API after apply."
  value       = module.app_environment.webapp_api_name
}

output "kv_name" {
  description = "Key Vault name — used by the CI secret-population step."
  value       = module.app_environment.kv_name
}

output "kv_uri" {
  description = "Key Vault URI — used to construct Key Vault reference strings in App Service settings."
  value       = module.app_environment.kv_uri
}
