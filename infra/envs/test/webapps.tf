resource "azurerm_linux_web_app" "frontend" {
  name                = "app-aie-frontend-test-tfg"
  resource_group_name = azurerm_resource_group.test.name
  location            = azurerm_resource_group.test.location
  service_plan_id     = azurerm_service_plan.test.id

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on                               = false
    container_registry_use_managed_identity = true

    application_stack {
      docker_image_name   = "app-insights-explorer-frontend:latest"
      docker_registry_url = "https://${var.acr_login_server}"
    }
  }

  app_settings = {
    # Key Vault references — resolved at startup via managed identity
    "AppRegistrationClientId"     = local.kv_ref.app_reg_client_id
    "AppRegistrationClientSecret" = local.kv_ref.app_reg_client_secret
    "BackendApiSecret"            = local.kv_ref.backend_api_secret
    "NextAuthSecret"              = local.kv_ref.nextauth_secret

    # Plain text — not sensitive, environment-specific
    "AppRegistrationTenantId" = "consumers"
    "NEXTAUTH_URL"            = "https://app-aie-frontend-test-tfg.azurewebsites.net"
    "NEXT_PUBLIC_API_URL"     = "https://app-aie-api-test-tfg.azurewebsites.net"
  }
}

resource "azurerm_linux_web_app" "api" {
  name                = "app-aie-api-test-tfg"
  resource_group_name = azurerm_resource_group.test.name
  location            = azurerm_resource_group.test.location
  service_plan_id     = azurerm_service_plan.test.id

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on                               = false
    container_registry_use_managed_identity = true

    application_stack {
      docker_image_name   = "app-insights-explorer-api:latest"
      docker_registry_url = "https://${var.acr_login_server}"
    }
  }

  app_settings = {
    # Key Vault references — resolved at startup via managed identity
    "AnthropicApiKey"  = local.kv_ref.anthropic_api_key
    "BackendApiSecret" = local.kv_ref.backend_api_secret

    # Plain text — not sensitive, environment-specific
    "AppRegistrationTenantId" = "consumers"
    "FRONTEND_ORIGIN"         = "https://app-aie-frontend-test-tfg.azurewebsites.net"
  }
}
