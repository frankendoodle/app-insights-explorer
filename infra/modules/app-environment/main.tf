resource "azurerm_resource_group" "test" {
  name     = "rg-app-insights-explorer-${var.env_name}-${var.suffix}"
  location = "westus2"
}

resource "azurerm_service_plan" "test" {
  name                = "asp-app-insights-explorer-${var.env_name}-${var.suffix}"
  resource_group_name = azurerm_resource_group.test.name
  location            = azurerm_resource_group.test.location
  os_type             = "Linux"
  sku_name            = var.sku_name
}
