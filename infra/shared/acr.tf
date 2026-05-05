resource "azurerm_container_registry" "main" {
  name                = "craietesttfg"
  resource_group_name = "rg-aie-tfstate"
  location            = "westus2"
  sku                 = "Basic"
  admin_enabled       = false
}
