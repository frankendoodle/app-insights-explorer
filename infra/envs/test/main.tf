resource "azurerm_resource_group" "test" {
  name     = "rg-app-insights-explorer-test-tfg"
  location = "eastus"
}

resource "azurerm_service_plan" "test" {
  name                = "asp-app-insights-explorer-test-tfg"
  resource_group_name = azurerm_resource_group.test.name
  location            = azurerm_resource_group.test.location
  os_type             = "Linux"
  sku_name            = "B1"
}
