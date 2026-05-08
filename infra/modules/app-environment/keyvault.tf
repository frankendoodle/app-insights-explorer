data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "test" {
  name                       = "kv-aie-${var.env_name}-${var.suffix}"
  resource_group_name        = azurerm_resource_group.test.name
  location                   = azurerm_resource_group.test.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  enable_rbac_authorization  = true
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
}
