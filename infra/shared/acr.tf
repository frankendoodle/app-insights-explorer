resource "azurerm_container_registry" "main" {
  name                = "craietesttfg"
  resource_group_name = "rg-aie-tfstate"
  location            = "eastus"
  sku                 = "Basic"
  admin_enabled       = false
}
