data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "test" {
  name                       = "kv-aie-${var.env_name}-${var.suffix}"
  resource_group_name        = azurerm_resource_group.test.name
  location                   = azurerm_resource_group.test.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
}
