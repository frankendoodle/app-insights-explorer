resource "azurerm_linux_web_app" "frontend" {
  name                = "app-aie-frontend-test-tfg"
  resource_group_name = azurerm_resource_group.test.name
  location            = azurerm_resource_group.test.location
  service_plan_id     = azurerm_service_plan.test.id

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on = false

    application_stack {
      docker_image_name   = "app-insights-explorer-frontend:latest"
      docker_registry_url = "https://${var.acr_login_server}"
    }
  }

  app_settings = {
    # Settings added in Task 11
  }

  lifecycle {
    ignore_changes = [
      app_settings,
    ]
  }
}
